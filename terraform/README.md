# Azure Container Apps con Terraform

Este directorio crea:

- Un Resource Group.
- Un Log Analytics Workspace.
- Un Container Apps Environment.
- Una Azure Container App con ingress HTTPS, escalado básico y soporte para registry privado.
- Los registros CNAME y TXT de `dimensionador.azure.cloudainops.com` en la zona DNS existente.
- Un certificado administrado por Azure y su vinculación HTTPS, definidos íntegramente con Terraform.

## Requisitos

- Terraform >= 1.6.
- Azure CLI autenticado con `az login`.
- Permisos para crear recursos en la suscripción.
- Una imagen de contenedor ya publicada en un registry accesible por ACA.
- Acceso de escritura a los registros de la zona pública `azure.cloudainops.com`, en `rg-cloudainops-dns`, dentro de la misma suscripción. La zona debe estar delegada a sus servidores de Azure DNS.

## Despliegue

1. Copia `terraform.tfvars.example` como `terraform.tfvars` y cambia `container_image`, la suscripción y el puerto real de la aplicación.
2. Inicializa y valida:

```powershell
terraform init
terraform fmt -check
terraform validate
```

3. Revisa el plan y aplica:

```powershell
terraform plan -out main.tfplan
terraform apply main.tfplan
```

4. Obtén la URL pública:

```powershell
terraform output -raw container_app_url
```

Para autenticación del proveedor puede usarse `az login --tenant <TENANT_ID>`; Terraform usará la sesión de Azure CLI. También puedes establecer `ARM_SUBSCRIPTION_ID` y `ARM_TENANT_ID` en lugar de guardar los IDs en un archivo local.

El proveedor registra automáticamente `Microsoft.App` y `Microsoft.OperationalInsights` durante `plan/apply`. La identidad autenticada necesita permiso `Microsoft.Resources/subscriptions/providers/register/action`, incluido normalmente en los roles `Contributor` y `Owner`.

## Subdominio y HTTPS

La configuración predeterminada publica la aplicación en `https://dimensionador.azure.cloudainops.com`. Puedes cambiar estos valores en `terraform.tfvars`:

```hcl
custom_domain_enabled        = true
dns_zone_name                = "azure.cloudainops.com"
dns_zone_resource_group_name = "rg-cloudainops-dns"
subdomain                    = "dimensionador"
```

`custom-domain.tf` consulta la zona existente como un `data` source: no la crea ni la elimina. Crea el CNAME `dimensionador` apuntando directamente al FQDN de Container Apps y el TXT `asuid.dimensionador` con el identificador de verificación de la aplicación.

Después registra el hostname, solicita un certificado con validación CNAME y activa la vinculación `SniEnabled`. AzureRM administra el certificado; AzAPI administra los campos de dominio que AzureRM 4.81 no permite vincular a un certificado administrado. Todo se ejecuta con `terraform apply`, sin `local-exec`, scripts, comandos de Azure CLI ni pasos manuales para crear el certificado. Azure CLI solo es una opción de autenticación de los proveedores.

La configuración administra la lista completa de dominios personalizados de esta aplicación. Define sus cambios aquí; no agregues dominios adicionales manualmente en el portal. Al destruir, desactivar el dominio o reemplazar el certificado, Terraform desvincula primero el certificado para que Azure permita eliminarlo. Los registros DNS del proyecto se eliminan al destruir o desactivar la función; la zona compartida permanece.

La propagación DNS y emisión del certificado pueden tardar varios minutos. El registro inicial del hostname reintenta errores de verificación DNS hasta 30 minutos. Si Azure todavía rechaza la emisión por propagación del CNAME, espera a que resuelva públicamente y vuelve a ejecutar `terraform plan` y `terraform apply`. La aplicación debe conservar ingress público y un CNAME directo; si hay registros CAA restrictivos, deben permitir `digicert.com` para la emisión y renovación automática.

Si estos registros DNS ya existen fuera de este estado de Terraform, impórtalos antes de aplicar. Para usar solamente el dominio automático de Azure, establece `custom_domain_enabled = false`. `container_app_url` devuelve la URL elegida y `container_app_default_url` conserva la dirección automática.

Referencias: [dominios y certificados administrados de Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/custom-domains-managed-certificates), [certificado administrado de AzureRM](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/container_app_environment_managed_certificate) y [AzAPI](https://registry.terraform.io/providers/Azure/azapi/latest/docs/resources/update_resource).

## Pruebas locales

Con Terraform >= 1.7, `terraform test` ejecuta cinco escenarios con proveedores simulados, sin credenciales ni cambios en Azure: dominio predeterminado, función desactivada, otro subdominio, etiqueta inválida e ingress privado. `terraform validate` comprueba la configuración; el plan real verifica la lectura de la zona existente. La emisión del certificado y el acceso HTTPS solo se pueden comprobar después de aplicar.

## Registry privado

Define `registry_server`, `registry_username` y `registry_password` como variables sensibles. No guardes la contraseña en Git ni en `terraform.tfvars`; usa, por ejemplo, `TF_VAR_registry_password` desde el entorno de CI.

La configuración actual asume que el contenedor escucha en `container_port` y expone HTTP. Si la aplicación usa otro puerto, actualiza esa variable antes de aplicar.

