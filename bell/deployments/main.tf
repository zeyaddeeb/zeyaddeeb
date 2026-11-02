resource "helm_release" "bell" {
  name          = "bell"
  chart         = "${path.module}/helm"
  namespace     = var.namespace
  wait          = false
  wait_for_jobs = false
  timeout       = 600

  values = [
    templatefile("${path.module}/overrides.yaml", {
      image_repository = var.image_repository
      site             = var.site
      dealer           = var.dealer
      ntp              = var.ntp
    })
  ]
}
