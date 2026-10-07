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

## Troubleshooting

Check on Contabo

```
microk8s.kubectl get pods
microk8s.kubectl logs cestaky-deployment-788cd4b9dd-cq4rc 
```
