locals {
  namespace = "zeyaddeeb"
  ntp       = "169.254.169.254:123"
}

resource "kubernetes_namespace_v1" "us_east4" {
  provider = kubernetes.us_east4

  metadata {
    name = local.namespace
  }
}

resource "kubernetes_namespace_v1" "us_west1" {
  provider = kubernetes.us_west1

  metadata {
    name = local.namespace
  }
}

module "bell_us_east4" {
  source = "../"

  providers = {
    helm = helm.us_east4
  }

  namespace        = kubernetes_namespace_v1.us_east4.metadata[0].name
  image_repository = var.image_repository
  site             = "gcp-us-east4"
  ntp              = local.ntp
}

module "bell_us_west1" {
  source = "../"

  providers = {
    helm = helm.us_west1
  }

  namespace        = kubernetes_namespace_v1.us_west1.metadata[0].name
  image_repository = var.image_repository
  site             = "gcp-us-west1"
  ntp              = local.ntp
}
