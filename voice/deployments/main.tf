locals {
  image_repository = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${data.aws_region.current.region}.amazonaws.com/zeyaddeeb/voice"
  rtc_subnet       = sort(data.aws_subnets.public.ids)[0]
}

resource "aws_eip" "rtc" {
  count  = var.rtc ? 1 : 0
  domain = "vpc"

  tags = {
    Name = "voice-rtc"
  }
}

resource "helm_release" "voice" {
  name          = "voice"
  chart         = "${path.module}/helm"
  namespace     = var.namespace
  wait          = false
  wait_for_jobs = false
  timeout       = 1200

  values = [
    templatefile("${path.module}/overrides.yaml", {
      image_repository = local.image_repository
      rtc_enabled      = var.rtc
      rtc_subnet       = local.rtc_subnet
      rtc_allocation   = try(aws_eip.rtc[0].allocation_id, "")
      rtc_address      = try(aws_eip.rtc[0].public_ip, "")
      vpc_cidr         = data.aws_vpc.cluster.cidr_block
    })
  ]
}
