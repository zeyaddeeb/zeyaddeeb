data "template_file" "www_overrides" {
  template = file("${path.module}/values/www.overrides.yaml")

  vars = {
    image_repository = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${data.aws_region.current.name}.amazonaws.com/zeyaddeeb/www"
  }
}

resource "helm_release" "www" {
  name          = "www"
  chart         = "${path.module}/helm"
  namespace     = var.namespace
  wait          = false
  wait_for_jobs = false
  timeout       = 1200

  values = [
    data.template_file.www_overrides.rendered
  ]

}
