import type { IncomingHttpHeaders } from 'node:http';
import type { AuthContext } from './auth-context';

export interface RequestWithAuth {
    headers: IncomingHttpHeaders;
    authContext?: AuthContext;
}
