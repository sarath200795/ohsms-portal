import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthContext } from '../types/auth-context';
import type { RequestWithAuth } from '../types/request-with-auth';

export const CurrentAuthContext = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): AuthContext | undefined => {
        const request = ctx.switchToHttp().getRequest<RequestWithAuth>();
        return request.authContext;
    }
);
