# Migrate cestaky to k8s

1. TODO - Create VPS secrets (modify them per environment - e.g. via kubernetes dashboard)
2. Create mongo service

```
kubectl apply -f mongo3.yml
```

3. Create secrets for cestaky (modify them per environment)

```
kubectl apply -f cestaky-secrets.yml
```

4. Create cestaky service

```
kubectl apply -f cestaky.yml
```

You can try to check it via

```
kubectl port-forward --address 0.0.0.0 service/cestaky-service 10081:80
```

5. Setup reverse proxy to your k8s ingress controller.
   For contabo it is exposed to http://contabo.instea.co:15080/cestaky/

Troubleshooting ingress controller - e.g. get into pod

```
kubectl exec --stdin --tty -n ingress nginx-ingress-microk8s-controller-gktnz -- /bin/sh  
```

TODO - can we make host matching with external nginx to avoid problems with absolute paths?

## Auto-deploy (Keel + registry webhook)

Flow: push to `master` -> `release.yml` pushes `registry.instea.co/cestovne-prikazy:latest` (and `:<version>`) -> registry sends a push notification to Keel -> Keel rolls out `cestaky-deployment` (annotations in `cestaky.yml`). If the webhook gets lost, Keel polls the registry every 10 minutes.

### 1. Install Keel

```
sudo microk8s enable helm3
sudo microk8s kubectl get svc -A | grep 10.152.183.200    # must print nothing - the IP is reserved for Keel
sudo microk8s helm3 repo add keel https://charts.keel.sh
sudo microk8s helm3 repo update
sudo microk8s helm3 upgrade --install keel keel/keel -n keel --create-namespace -f keel/values.yaml
sudo microk8s kubectl -n keel rollout status deploy/keel
sudo microk8s kubectl apply -f cestaky.yml
sudo microk8s kubectl -n keel logs deploy/keel | grep -i cestovne   # image is tracked
```

## Troubleshooting

Check on Contabo

```
microk8s.kubectl get pods
microk8s.kubectl logs cestaky-deployment-788cd4b9dd-cq4rc 
```
