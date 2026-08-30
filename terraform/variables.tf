variable "subscription_id" {
  description = "Azure subscription ID. Can also be supplied through ARM_SUBSCRIPTION_ID."
  type        = string
  default     = null
  sensitive   = true
}

variable "name" {
  description = "Globally unique Container App name within the resource group."
  type        = string
  default     = "dimensionador-k8s"
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

