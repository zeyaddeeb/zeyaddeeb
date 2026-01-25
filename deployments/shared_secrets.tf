resource "kubernetes_manifest" "zeyaddeeb_external_secret" {
  manifest = {
    apiVersion = "external-secrets.io/v1"
    kind       = "ExternalSecret"
    metadata = {
      name      = "zeyaddeeb-secrets"
      namespace = kubernetes_namespace_v1.zeyaddeeb_namespace.metadata[0].name
    }
    spec = {
      refreshInterval = "1h"
      secretStoreRef = {
        name = "cluster-secret-store"
        kind = "ClusterSecretStore"
      }
      target = {
        name           = "zeyaddeeb-secrets"
        creationPolicy = "Owner"
      }
      data = [
        {
          secretKey = "ADMIN_EMAIL"
          remoteRef = {
            key      = "zeyaddeeb/admin"
            property = "email"
          }
        },
        {
          secretKey = "ADMIN_PASSWORD"
          remoteRef = {
            key      = "zeyaddeeb/admin"
            property = "password"
          }
        },
        {
          secretKey = "ADMIN_NAME"
          remoteRef = {
            key      = "zeyaddeeb/admin"
            property = "name"
          }
        },
        {
          secretKey = "ADMIN_ID"
          remoteRef = {
            key      = "zeyaddeeb/admin"
            property = "id"
          }
        },
        {
          secretKey = "DATABASE_URL"
          remoteRef = {
            key      = "zeyaddeeb/admin"
            property = "db"
          }
        },
        {
          secretKey = "BETTER_AUTH_SECRET"
          remoteRef = {
            key      = "zeyaddeeb/admin"
            property = "better_auth_secret"
          }
        }
      ]
    }
  }

  depends_on = [
    kubernetes_namespace_v1.zeyaddeeb_namespace
  ]
}
