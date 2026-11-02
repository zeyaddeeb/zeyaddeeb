terraform {
  required_version = ">= 1.0"

  backend "gcs" {
    prefix = "zeyaddeeb/bell-gke"
  }

  required_providers {
    google = {
      source = "hashicorp/google"
    }
  }
}

provider "google" {
  project = var.project_id
}

data "google_client_config" "current" {}

data "google_container_cluster" "us_east4" {
  name     = "shared"
  location = "us-east4"
}

data "google_container_cluster" "us_west1" {
  name     = "shared-us-west1"
  location = "us-west1-b"
}

locals {
  endpoints = {
    us_east4 = "https://${data.google_container_cluster.us_east4.control_plane_endpoints_config[0].dns_endpoint_config[0].endpoint}"
    us_west1 = "https://${data.google_container_cluster.us_west1.control_plane_endpoints_config[0].dns_endpoint_config[0].endpoint}"
  }
}

provider "kubernetes" {
  alias = "us_east4"
  host  = local.endpoints.us_east4
  token = data.google_client_config.current.access_token
}

provider "kubernetes" {
  alias = "us_west1"
  host  = local.endpoints.us_west1
  token = data.google_client_config.current.access_token
}

provider "helm" {
  alias = "us_east4"
  kubernetes = {
    host  = local.endpoints.us_east4
    token = data.google_client_config.current.access_token
  }
}

provider "helm" {
  alias = "us_west1"
  kubernetes = {
    host  = local.endpoints.us_west1
    token = data.google_client_config.current.access_token
  }
}
