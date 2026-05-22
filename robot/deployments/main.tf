resource "helm_release" "robot_web" {
  name          = "robot-web"
  chart         = "${path.module}/helm"
  namespace     = var.namespace
  wait          = false
  wait_for_jobs = false
  timeout       = 1200

  values = [
    templatefile("${path.module}/values/robot-web.overrides.yaml", {
      image_repository = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${data.aws_region.current.region}.amazonaws.com/zeyaddeeb/robot"
    })
  ]
}

resource "helm_release" "robot_ws" {
  name          = "robot-ws"
  chart         = "${path.module}/helm"
  namespace     = var.namespace
  wait          = false
  wait_for_jobs = false
  timeout       = 1200

  values = [
    templatefile("${path.module}/values/robot-ws.overrides.yaml", {
      image_repository = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${data.aws_region.current.region}.amazonaws.com/zeyaddeeb/robot"
    })
  ]
}
