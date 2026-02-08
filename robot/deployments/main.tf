data "template_file" "robot_web_overrides" {
  template = file("${path.module}/values/robot-web.overrides.yaml")

  vars = {
    image_repository = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${data.aws_region.current.name}.amazonaws.com/zeyaddeeb/robot"
  }
}

resource "helm_release" "robot_web" {
  name          = "robot-web"
  chart         = "${path.module}/helm"
  namespace     = var.namespace
  wait          = false
  wait_for_jobs = false
  timeout       = 1200

  values = [
    data.template_file.robot_web_overrides.rendered
  ]
}

data "template_file" "robot_ws_overrides" {
  template = file("${path.module}/values/robot-ws.overrides.yaml")

  vars = {
    image_repository = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${data.aws_region.current.name}.amazonaws.com/zeyaddeeb/robot"
  }
}

resource "helm_release" "robot_ws" {
  name          = "robot-ws"
  chart         = "${path.module}/helm"
  namespace     = var.namespace
  wait          = false
  wait_for_jobs = false
  timeout       = 1200

  values = [
    data.template_file.robot_ws_overrides.rendered
  ]
}
