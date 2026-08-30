terraform {
  required_version = ">= 1.6.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }
}

provider "azurerm" {
  features {}
  resource_provider_registrations = "none"
  resource_providers_to_register  = ["Microsoft.App", "Microsoft.OperationalInsights"]
  subscription_id = var.subscription_id
  tenant_id       = var.tenant_id
}

resource "azurerm_resource_group" "this" {
  name     = var.resource_group_name
  location = var.location
  tags     = var.tags
}

resource "azurerm_log_analytics_workspace" "this" {
  name                = "law-${var.name}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  sku                 = "PerGB2018"
  retention_in_days   = var.log_retention_days
  tags                = var.tags
}

resource "azurerm_container_app_environment" "this" {
  name                       = "cae-${var.name}"
  location                   = azurerm_resource_group.this.location
  resource_group_name        = azurerm_resource_group.this.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.this.id
  tags                       = var.tags
}

resource "azurerm_container_app" "this" {
  name                         = var.name
  container_app_environment_id = azurerm_container_app_environment.this.id
  resource_group_name          = azurerm_resource_group.this.name
  revision_mode                = var.revision_mode
  tags                         = var.tags

  dynamic "registry" {
    for_each = var.registry_server == null ? [] : [var.registry_server]
    content {
      server               = registry.value
      username             = var.registry_username
      password_secret_name = "registry-password"
    }
  }

  dynamic "secret" {
    for_each = var.registry_password == null ? [] : [var.registry_password]
    content {
      name  = "registry-password"
      value = secret.value
    }
  }

  ingress {
    external_enabled           = var.ingress_external_enabled
    target_port                = var.container_port
    transport                  = "auto"
    allow_insecure_connections = var.allow_insecure_connections

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  template {
    min_replicas = var.min_replicas
    max_replicas = var.max_replicas

    container {
      name   = var.name
      image  = var.container_image
      cpu    = var.container_cpu
      memory = var.container_memory

      dynamic "env" {
        for_each = var.container_env
        content {
          name        = env.key
          value       = env.value
          secret_name = null
        }
      }

    }
  }
}

