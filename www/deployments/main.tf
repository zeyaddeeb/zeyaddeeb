resource "helm_release" "www" {
  name          = "www"
  chart         = "${path.module}/helm"
  namespace     = var.namespace
  wait          = false
  wait_for_jobs = false
  timeout       = 1200

  values = [
    templatefile("${path.module}/values/www.overrides.yaml", {
      image_repository = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${data.aws_region.current.name}.amazonaws.com/zeyaddeeb/www"
    })
  ]

}

resource "helm_release" "blog" {
  name          = "blog"
  chart         = "${path.module}/helm"
  namespace     = var.namespace
  wait          = false
  wait_for_jobs = false
  timeout       = 1200

  values = [
    templatefile("${path.module}/values/blog.overrides.yaml", {
      image_repository = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${data.aws_region.current.name}.amazonaws.com/zeyaddeeb/www"
    })
  ]

}
