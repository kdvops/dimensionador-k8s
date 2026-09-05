variable "subscription_id" {
  description = "Azure subscription ID. Can also be supplied through ARM_SUBSCRIPTION_ID."
  type        = string
  default     = null
  sensitive   = true
}

variable "tenant_id" {
  description = "Azure tenant ID. Can also be supplied through ARM_TENANT_ID."
  type        = string
  default     = null
  sensitive   = true
}

variable "name" {
  description = "Globally unique Container App name within the resource group."
  type        = string
  default     = "dimensionador-k8s"
}

variable "custom_domain_enabled" {
  description = "Create DNS records and managed HTTPS for the application."
  type        = bool
  default     = true
}

variable "dns_zone_name" {
  description = "Existing public Azure DNS zone in the same subscription."
  type        = string
  default     = "azure.cloudainops.com"
}

variable "dns_zone_resource_group_name" {
  description = "Resource group that already contains the public DNS zone."
  type        = string
  default     = "rg-cloudainops-dns"
}

variable "subdomain" {
  description = "Single DNS label to create within dns_zone_name."
  type        = string
  default     = "dimensionador"

  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$", var.subdomain))
    error_message = "Use a DNS label of 1-63 lowercase letters, digits or internal hyphens."
  }
}

variable "resource_group_name" {
  type    = string
  default = "rg-dimensionador-k8s"
}

variable "location" {
  type    = string
  default = "East US"
}

variable "container_image" {
  description = "Container image, for example ghcr.io/org/app:tag or myacr.azurecr.io/app:tag."
  type        = string
}

variable "container_port" {
  type    = number
  default = 3000
}

variable "container_cpu" {
  type    = number
  default = 0.5
}

variable "container_memory" {
  type    = string
  default = "1Gi"
}

variable "min_replicas" {
  type    = number
  default = 1
}

variable "max_replicas" {
  type    = number
  default = 2
}

variable "revision_mode" {
  type    = string
  default = "Single"

  validation {
    condition     = contains(["Single", "Multiple"], var.revision_mode)
    error_message = "revision_mode must be Single or Multiple."
  }
}

variable "ingress_external_enabled" {
  type    = bool
  default = true
}

variable "allow_insecure_connections" {
  type    = bool
  default = false
}

variable "registry_server" {
  description = "Private registry hostname. Leave null for public images."
  type        = string
  default     = null
}

variable "registry_username" {
  type      = string
  default   = null
  sensitive = true
}

variable "registry_password" {
  type      = string
  default   = null
  sensitive = true
}

variable "container_env" {
  description = "Non-sensitive environment variables for the container."
  type        = map(string)
  default     = {}
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "tags" {
  type = map(string)
  default = {
    managed-by = "terraform"
    workload   = "dimensionador-k8s"
  }
}

