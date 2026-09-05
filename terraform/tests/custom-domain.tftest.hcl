# Runs without Azure credentials or provisioning resources (Terraform >= 1.7).
mock_provider "azurerm" {
  mock_resource "azurerm_log_analytics_workspace" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-test/providers/Microsoft.OperationalInsights/workspaces/test"
    }
  }
  mock_resource "azurerm_container_app_environment" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-test/providers/Microsoft.App/managedEnvironments/test"
    }
  }
  mock_resource "azurerm_container_app_environment_managed_certificate" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-test/providers/Microsoft.App/managedEnvironments/test/managedCertificates/test"
    }
  }
}
mock_provider "azapi" {}

variables {
  container_image = "ghcr.io/kdvops/dimensionador-k8s:latest"
}

override_resource {
  target = azurerm_container_app.this
  values = {
    id                            = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-test/providers/Microsoft.App/containerApps/test"
    custom_domain_verification_id = "test-verification-token"
    ingress                       = { fqdn = "test.azurecontainerapps.io" }
  }
}

run "custom_domain" {
  command = apply

  assert {
    condition     = output.container_app_url == "https://dimensionador.azure.cloudainops.com"
    error_message = "The public URL must use the configured subdomain."
  }

  assert {
    condition     = azurerm_dns_cname_record.app[0].record == "test.azurecontainerapps.io" && azurerm_dns_cname_record.app[0].name == "dimensionador"
    error_message = "The subdomain must point directly to the Container App."
  }

  assert {
    condition     = azurerm_dns_txt_record.verification[0].name == "asuid.dimensionador" && one(azurerm_dns_txt_record.verification[0].record).value == "test-verification-token"
    error_message = "Ownership verification must use the application's token."
  }

  assert {
    condition     = azurerm_container_app_environment_managed_certificate.app[0].domain_control_validation == "CNAME" && azapi_update_resource.https[0].body.properties.configuration.ingress.customDomains[0].bindingType == "SniEnabled"
    error_message = "A managed certificate and HTTPS binding are both required."
  }

  assert {
    condition     = azapi_resource_action.unbind[0].when == "destroy" && length(azapi_resource_action.unbind[0].body.properties.configuration.ingress.customDomains) == 0
    error_message = "Deletion must detach the certificate before removing it."
  }
}

run "automatic_domain_only" {
  command = apply
  variables {
    custom_domain_enabled = false
  }

  assert {
    condition     = output.container_app_url == "https://test.azurecontainerapps.io" && length(azurerm_dns_cname_record.app) == 0 && length(azurerm_dns_txt_record.verification) == 0 && length(azurerm_container_app_environment_managed_certificate.app) == 0 && length(azapi_update_resource.https) == 0 && length(azapi_resource_action.unbind) == 0
    error_message = "Disabling the feature must omit DNS, certificate and domain resources."
  }
}

run "alternate_subdomain" {
  command = apply
  variables {
    subdomain = "calculadora"
  }
  assert {
    condition     = output.container_app_url == "https://calculadora.azure.cloudainops.com" && azurerm_dns_txt_record.verification[0].name == "asuid.calculadora"
    error_message = "Changing the subdomain must update both the URL and DNS verification."
  }
}

run "reject_invalid_label" {
  command = plan
  variables {
    subdomain = "https://dimensionador"
  }
  expect_failures = [var.subdomain]
}

run "reject_private_ingress" {
  command = plan
  variables {
    ingress_external_enabled = false
  }
  expect_failures = [azurerm_container_app.this]
}
