# Azure Container Apps con Terraform

Este directorio crea:

- Un Resource Group.
- Un Log Analytics Workspace.
- Un Container Apps Environment.
- Una Azure Container App con ingress HTTPS, escalado básico y soporte para registry privado.

## Requisitos

- Terraform >= 1.6.
- Azure CLI autenticado con `az login`.
- Permisos para crear recursos en la suscripción.
- Una imagen de contenedor ya publicada en un registry accesible por ACA.

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

Para autenticación del proveedor puede usarse `az login`; Terraform usará la sesión de Azure CLI. También puedes establecer `ARM_SUBSCRIPTION_ID` en lugar de guardar el ID en un archivo local.

## Registry privado

Define `registry_server`, `registry_username` y `registry_password` como variables sensibles. No guardes la contraseña en Git ni en `terraform.tfvars`; usa, por ejemplo, `TF_VAR_registry_password` desde el entorno de CI.

La configuración actual asume que el contenedor escucha en `container_port` y expone HTTP. Si la aplicación usa otro puerto, actualiza esa variable antes de aplicar.

