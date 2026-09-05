locals {
  custom_domain = "${var.subdomain}.${var.dns_zone_name}"
}

# The shared zone belongs to existing infrastructure, not this project.
data "azurerm_dns_zone" "existing" {
  count               = var.custom_domain_enabled ? 1 : 0
  name                = var.dns_zone_name
  resource_group_name = var.dns_zone_resource_group_name
}

resource "azurerm_dns_cname_record" "app" {
  count               = var.custom_domain_enabled ? 1 : 0
  name                = var.subdomain
  zone_name           = data.azurerm_dns_zone.existing[0].name
  resource_group_name = data.azurerm_dns_zone.existing[0].resource_group_name
  ttl                 = 300
  record              = azurerm_container_app.this.ingress[0].fqdn
  tags                = var.tags
}

resource "azurerm_dns_txt_record" "verification" {
  count               = var.custom_domain_enabled ? 1 : 0
  name                = "asuid.${var.subdomain}"
  zone_name           = data.azurerm_dns_zone.existing[0].name
  resource_group_name = data.azurerm_dns_zone.existing[0].resource_group_name
  ttl                 = 300
  tags                = var.tags

  record {
    value = azurerm_container_app.this.custom_domain_verification_id
  }
}

# Azure requires the hostname before it can issue its certificate.
# This resource only bootstraps the hostname; https owns the final binding.
resource "azapi_update_resource" "hostname" {
  count       = var.custom_domain_enabled ? 1 : 0
  type        = "Microsoft.App/containerApps@2025-07-01"
  resource_id = azurerm_container_app.this.id
  body = {
    properties = {
      configuration = {
        ingress = {
          customDomains = [{ name = local.custom_domain, bindingType = "Disabled" }]
        }
      }
    }
  }
  replace_triggers_external_values = [local.custom_domain]

  lifecycle {
    ignore_changes = [body]
  }

  retry = {
    error_message_regex  = ["(?i).*txt.*", "(?i).*cname.*", "(?i).*domain.*verif.*"]
    interval_seconds     = 15
    max_interval_seconds = 60
  }

  timeouts {
    create = "30m"
    update = "30m"
  }

  depends_on = [azurerm_dns_cname_record.app, azurerm_dns_txt_record.verification]
}

resource "azurerm_container_app_environment_managed_certificate" "app" {
  count                        = var.custom_domain_enabled ? 1 : 0
  name                         = "cert-${var.subdomain}"
  container_app_environment_id = azurerm_container_app_environment.this.id
  subject_name                 = local.custom_domain
  domain_control_validation    = "CNAME"
  tags                         = var.tags

  depends_on = [azapi_update_resource.hostname]
}

# AzureRM 4.81 cannot bind a managedCertificates ID to a custom domain.
resource "azapi_update_resource" "https" {
  count       = var.custom_domain_enabled ? 1 : 0
  type        = "Microsoft.App/containerApps@2025-07-01"
  resource_id = azurerm_container_app.this.id
  body = {
    properties = {
      configuration = {
        ingress = {
          customDomains = [{
            name          = local.custom_domain
            bindingType   = "SniEnabled"
            certificateId = azurerm_container_app_environment_managed_certificate.app[0].id
          }]
        }
      }
    }
  }

  lifecycle {
    replace_triggered_by = [azurerm_container_app_environment_managed_certificate.app]
  }
}

# A bound certificate cannot be deleted. Detach it first on destroy,
# disabling the feature, or replacing the hostname/certificate.
resource "azapi_resource_action" "unbind" {
  count            = var.custom_domain_enabled ? 1 : 0
  type             = "Microsoft.App/containerApps@2025-07-01"
  resource_id      = azurerm_container_app.this.id
  method           = "PATCH"
  when             = "destroy"
  ignore_not_found = true
  body = {
    properties = {
      configuration = {
        ingress = { customDomains = [] }
      }
    }
  }

  lifecycle {
    replace_triggered_by = [azapi_update_resource.https]
  }

  depends_on = [azapi_update_resource.https]
}
