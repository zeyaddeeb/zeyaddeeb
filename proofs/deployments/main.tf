locals {
  image_repository = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${data.aws_region.current.region}.amazonaws.com/zeyaddeeb/proofs"
}

resource "helm_release" "proofs" {
  name          = "proofs"
  chart         = "${path.module}/helm"
  namespace     = var.namespace
  wait          = false
  wait_for_jobs = false
  timeout       = 1200

  values = [
    templatefile("${path.module}/overrides.yaml", {
      image_repository = local.image_repository
    })
  ]

}
