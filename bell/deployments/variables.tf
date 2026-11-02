variable "namespace" {
  type = string
}

variable "image_repository" {
  type = string
}

variable "site" {
  type = string

  validation {
    condition     = contains(["gcp-us-west1", "gcp-us-east4", "aws-us-east-1"], var.site)
    error_message = "site must be one of the three stations."
  }
}

variable "dealer" {
  type    = bool
  default = false
}

variable "ntp" {
  type = string
}
