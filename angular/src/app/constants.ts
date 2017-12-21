import { environment } from '../environments/environment';

export const SERVER_URL = environment.serverBase;
export const GRAPHQL_URL = `${SERVER_URL}/graphql`;
export const REFRESH_JWT_URL = `${SERVER_URL}/refresh-jwt`;
export const EXPORT_URL = `${SERVER_URL}/export/detail`;

export const REFRESH_JWT_INTERVAL = 15 * 60 * 1000; // 15 minutes
