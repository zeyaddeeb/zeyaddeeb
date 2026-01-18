module "wwww" {
  source    = "../www/deployments"
  namespace = kubernetes_namespace_v1.zeyaddeeb_namespace.metadata[0].name
}
