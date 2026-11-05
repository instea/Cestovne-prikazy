# k8s Secrets (OPS-03)

Secret values never go into this repository. Create the Secrets by hand in the
`default` namespace before you apply the manifests. This file lists only the
names and keys.

## `cestaky-leaves-secrets` (app, `envFrom` in `app.yml`)

| Key                 | Env var             | Used for                                  |
| ------------------- | ------------------- | ----------------------------------------- |
| `MONGO_URL`         | `MONGO_URL`         | MongoDB connection, contains the password |
| `JWT_ACCESS_SECRET` | `JWT_ACCESS_SECRET` | access token signing (AUTH-02), ≥32 bytes |
| `SMTP_USER`         | `SMTP_USER`         | SMTP login                                |
| `SMTP_PASSWORD`     | `SMTP_PASSWORD`     | SMTP login                                |
| `M2M_USERNAME`      | `M2M_USERNAME`      | attendance M2M API basic auth             |
| `M2M_PASSWORD`      | `M2M_PASSWORD`      | attendance M2M API basic auth             |
| `SSO_USERNAME`      | `SSO_USERNAME`      | SSO meta API (attendance)                 |
| `SSO_PASSWORD`      | `SSO_PASSWORD`      | SSO meta API (attendance)                 |

`MONGO_URL` format (app user created by the `mongo8-rs-init` Job):

```text
mongodb://<app user>:<password>@mongo8-service:27017/cestaky?authSource=cestaky&replicaSet=rs0
```

URL-encode special characters in the user name and password.

## `mongo8-secrets` (MongoDB, `mongo8.yml` and `mongo8-rs-init.yml`)

| Key                          | Used by                                                                    |
| ---------------------------- | -------------------------------------------------------------------------- |
| `MONGO_INITDB_ROOT_USERNAME` | `mongo8-sfset` root user; the backup and restore scripts use it in the pod |
| `MONGO_INITDB_ROOT_PASSWORD` | `mongo8-sfset` root user                                                   |
| `MONGO_APP_USERNAME`         | `mongo8-rs-init` Job: app user in DB `cestaky`                             |
| `MONGO_APP_PASSWORD`         | `mongo8-rs-init` Job: app user password                                    |
| `keyfile`                    | replica-set internal auth, file at `/etc/mongo/keyfile` (mode 0400)        |

## `instea-registry` (existing)

Docker registry credentials for `registry.instea.co`, used as
`imagePullSecrets`. It already exists in the cluster.

## Create the Secrets

Run the commands in a shell that does not keep history (for example, start
with `set +o history`), or type the values at a prompt.

```sh
openssl rand -base64 756 > keyfile

microk8s kubectl create secret generic mongo8-secrets \
  --from-literal=MONGO_INITDB_ROOT_USERNAME=root \
  --from-literal=MONGO_INITDB_ROOT_PASSWORD="$(openssl rand -hex 24)" \
  --from-literal=MONGO_APP_USERNAME=cestaky \
  --from-literal=MONGO_APP_PASSWORD="$APP_PW" \
  --from-file=keyfile=./keyfile

microk8s kubectl create secret generic cestaky-leaves-secrets \
  --from-literal=MONGO_URL="mongodb://cestaky:$APP_PW@mongo8-service:27017/cestaky?authSource=cestaky&replicaSet=rs0" \
  --from-literal=JWT_ACCESS_SECRET="$(openssl rand -base64 48)" \
  --from-literal=SMTP_USER=... \
  --from-literal=SMTP_PASSWORD=... \
  --from-literal=M2M_USERNAME=... \
  --from-literal=M2M_PASSWORD=... \
  --from-literal=SSO_USERNAME=... \
  --from-literal=SSO_PASSWORD=...

rm keyfile
```

Set `APP_PW` first, for example `APP_PW="$(openssl rand -hex 24)"` (hex, so it
needs no URL encoding).

## Apply order

1. `mongo8.yml`, then wait until `mongo8-sfset-0` is Ready.
2. `mongo8-rs-init.yml`, then wait until Job `mongo8-rs-init` completes.
3. `config.yml`, then `app.yml`.
4. Check: `microk8s kubectl port-forward service/cestaky-leaves-service 10082:80`
   and `curl -i http://localhost:10082/health-check` must answer 200.
5. At cutover (MIG-04 step 14): `ingress.yml`.
