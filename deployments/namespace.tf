resource "kubernetes_namespace_v1" "zeyaddeeb_namespace" {
  metadata {
    annotations = {
      name = "zeyaddeeb"
    }

    name = "zeyaddeeb"
  }
}
