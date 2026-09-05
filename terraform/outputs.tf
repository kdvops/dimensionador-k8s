output "container_app_id" {
  value = azurerm_container_app.this.id
}

output "container_app_fqdn" {
  value = azurerm_container_app.this.ingress[0].fqdn
}

output "container_app_url" {
  value      = "https://${var.custom_domain_enabled ? local.custom_domain : azurerm_container_app.this.ingress[0].fqdn}"
  depends_on = [azapi_update_resource.https]
}

output "container_app_default_url" {
  value = "https://${azurerm_container_app.this.ingress[0].fqdn}"
}

output "custom_domain" {
  value = var.custom_domain_enabled ? local.custom_domain : null
}

output "resource_group_name" {
  value = azurerm_resource_group.this.name
}

output "container_app_environment_id" {
  value = azurerm_container_app_environment.this.id
}

