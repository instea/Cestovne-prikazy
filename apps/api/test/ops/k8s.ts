import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GenericContainer } from 'testcontainers';
import { parseAllDocuments } from 'yaml';

/** Helpers for the OPS-03 manifest tests (`deploy/k8s/*.yml`). */

export const repoRoot = join(__dirname, '..', '..', '..', '..');
export const deployDir = join(repoRoot, 'deploy');
export const k8sDir = join(deployDir, 'k8s');

export interface EnvVar {
  name: string;
  value?: string;
  valueFrom?: { secretKeyRef?: { name: string; key: string } };
}

export interface Probe {
  httpGet?: { path: string; port: number };
  tcpSocket?: { port: number };
  exec?: { command: string[] };
  initialDelaySeconds?: number;
  periodSeconds?: number;
  timeoutSeconds?: number;
  failureThreshold?: number;
}

export interface SecurityContext {
  runAsNonRoot?: boolean;
  runAsUser?: number;
  runAsGroup?: number;
  readOnlyRootFilesystem?: boolean;
  allowPrivilegeEscalation?: boolean;
  capabilities?: { drop?: string[]; add?: string[] };
  seccompProfile?: { type: string };
}

export interface Container {
  name: string;
  image: string;
  imagePullPolicy?: string;
  command?: string[];
  args?: string[];
  env?: EnvVar[];
  envFrom?: {
    configMapRef?: { name: string };
    secretRef?: { name: string };
  }[];
  ports?: { containerPort: number; name?: string }[];
  readinessProbe?: Probe;
  livenessProbe?: Probe;
  securityContext?: SecurityContext;
  resources?: {
    requests?: Record<string, string>;
    limits?: Record<string, string>;
  };
  volumeMounts?: { name: string; mountPath: string; readOnly?: boolean }[];
}

export interface Volume {
  name: string;
  emptyDir?: Record<string, unknown>;
  persistentVolumeClaim?: { claimName: string };
  secret?: {
    secretName: string;
    defaultMode?: number;
    items?: { key: string; path: string; mode?: number }[];
  };
  configMap?: { name: string };
}

export interface PodSpec {
  imagePullSecrets?: { name: string }[];
  initContainers?: Container[];
  containers: Container[];
  volumes?: Volume[];
  securityContext?: SecurityContext;
  terminationGracePeriodSeconds?: number;
  restartPolicy?: string;
}

export interface PodTemplate {
  metadata: { labels: Record<string, string> };
  spec: PodSpec;
}

export interface K8sObject {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  // Kind-specific fields, narrowed by the typed accessors below.
  spec?: unknown;
  data?: Record<string, string>;
  stringData?: Record<string, string>;
}

export interface Deployment extends K8sObject {
  spec: {
    replicas: number;
    strategy: {
      type: string;
      rollingUpdate: { maxSurge: number; maxUnavailable: number };
    };
    selector: { matchLabels: Record<string, string> };
    template: PodTemplate;
  };
}

export interface StatefulSet extends K8sObject {
  spec: {
    replicas: number;
    serviceName: string;
    selector: { matchLabels: Record<string, string> };
    template: PodTemplate;
  };
}

export interface Job extends K8sObject {
  spec: { backoffLimit?: number; template: PodTemplate };
}

export interface Service extends K8sObject {
  spec: {
    clusterIP?: string;
    selector: Record<string, string>;
    ports: { port: number; targetPort?: number | string; name?: string }[];
  };
}

export interface Ingress extends K8sObject {
  spec: {
    ingressClassName: string;
    rules: {
      http: {
        paths: {
          path: string;
          pathType: string;
          backend: { service: { name: string; port: { number: number } } };
        }[];
      };
    }[];
  };
}

export interface PersistentVolumeClaim extends K8sObject {
  spec: {
    accessModes: string[];
    storageClassName: string;
    resources: { requests: { storage: string } };
  };
}

export interface ConfigMap extends K8sObject {
  data: Record<string, string>;
}

/** Every `*.yml` / `*.yaml` file under `deploy/k8s`, relative to it. */
export function manifestFiles(dir: string = k8sDir, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) return manifestFiles(join(dir, e.name), rel);
    return /\.ya?ml$/.test(e.name) ? [rel] : [];
  });
}

/** All documents of one manifest file; throws on YAML errors. */
export function loadManifest(file: string): K8sObject[] {
  const docs = parseAllDocuments(readFileSync(join(k8sDir, file), 'utf8'));
  if (!Array.isArray(docs)) throw new Error(`${file}: not a YAML stream`);
  return docs
    .map((d) => {
      const [error] = d.errors;
      if (error) throw new Error(`${file}: ${error.message}`);
      return d.toJS() as K8sObject | null;
    })
    .filter((d): d is K8sObject => d !== null);
}

/** The single object of `kind` named `name` in `objects`. */
export function findObject<T extends K8sObject>(
  objects: K8sObject[],
  kind: string,
  name: string,
): T {
  const matches = objects.filter(
    (o) => o.kind === kind && o.metadata.name === name,
  );
  if (matches.length !== 1) {
    throw new Error(`expected one ${kind} ${name}, found ${matches.length}`);
  }
  return matches[0] as T;
}

export function containerNamed(spec: PodSpec, name: string): Container {
  const c = spec.containers.find((x) => x.name === name);
  if (!c) throw new Error(`no container ${name}`);
  return c;
}

export function volumeNamed(spec: PodSpec, name: string): Volume {
  const v = spec.volumes?.find((x) => x.name === name);
  if (!v) throw new Error(`no volume ${name}`);
  return v;
}

export function readRepoFile(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8');
}

/**
 * A Docker container started with the restrictions of a k8s container
 * `securityContext`: read-only root filesystem, no-new-privileges, dropped
 * and added capabilities, and the user (unless `keepImageUser`).
 */
export class PodLikeContainer extends GenericContainer {
  withSecurityContext(
    ctx: SecurityContext | undefined,
    { keepImageUser = false } = {},
  ): this {
    if (!ctx) return this;
    if (ctx.readOnlyRootFilesystem) this.hostConfig.ReadonlyRootfs = true;
    if (ctx.allowPrivilegeEscalation === false) {
      this.hostConfig.SecurityOpt = [
        ...((this.hostConfig.SecurityOpt as string[] | undefined) ?? []),
        'no-new-privileges',
      ];
    }
    if (ctx.capabilities?.drop) {
      this.hostConfig.CapDrop = ctx.capabilities.drop;
    }
    if (ctx.capabilities?.add) this.hostConfig.CapAdd = ctx.capabilities.add;
    if (ctx.runAsUser !== undefined && !keepImageUser) {
      this.withUser(
        ctx.runAsGroup === undefined
          ? String(ctx.runAsUser)
          : `${ctx.runAsUser}:${ctx.runAsGroup}`,
      );
    }
    return this;
  }
}
