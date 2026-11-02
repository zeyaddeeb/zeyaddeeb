module "robot" {
  source    = "../robot/deployments"
  namespace = kubernetes_namespace_v1.zeyaddeeb_namespace.metadata[0].name
}

module "crdt" {
  source    = "../crdt/deployments"
  namespace = kubernetes_namespace_v1.zeyaddeeb_namespace.metadata[0].name
}

module "deepseek" {
  source    = "../deepseek/deployments"
  namespace = kubernetes_namespace_v1.zeyaddeeb_namespace.metadata[0].name
}

module "proofs" {
  source    = "../proofs/deployments"
  namespace = kubernetes_namespace_v1.zeyaddeeb_namespace.metadata[0].name
}

module "capacity" {
  source    = "../capacity/deployments"
  namespace = kubernetes_namespace_v1.zeyaddeeb_namespace.metadata[0].name
}

module "research" {
  source    = "../crispr/research/deployments"
  namespace = kubernetes_namespace_v1.zeyaddeeb_namespace.metadata[0].name
}

module "voice" {
  source       = "../voice/deployments"
  namespace    = kubernetes_namespace_v1.zeyaddeeb_namespace.metadata[0].name
  cluster_name = local.cluster_name
}

module "bell" {
  source           = "../bell/deployments"
  namespace        = kubernetes_namespace_v1.zeyaddeeb_namespace.metadata[0].name
  image_repository = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com/zeyaddeeb/bell"
  site             = "aws-us-east-1"
  dealer           = true
  ntp              = "169.254.169.123:123"
}

module "wwww" {
  source    = "../www/deployments"
  namespace = kubernetes_namespace_v1.zeyaddeeb_namespace.metadata[0].name

  depends_on = [
    kubernetes_manifest.zeyaddeeb_external_secret,
    module.crdt,
    module.deepseek,
    module.proofs,
    module.capacity,
    module.research,
    module.voice,
    module.bell,
  ]
}

