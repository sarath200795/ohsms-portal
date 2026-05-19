import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { RequestWithAuth } from '../../shared/types/request-with-auth';
import { FirebaseIdentityService } from './firebase-identity.service';
import { MockFirebaseAuthService } from './mock-firebase-auth.service';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
    constructor(
        private readonly mockAuthService: MockFirebaseAuthService,
        private readonly firebaseIdentityService: FirebaseIdentityService
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<RequestWithAuth>();
        const bearerToken = this.firebaseIdentityService.extractBearerToken(request.headers);

        if (bearerToken) {
            request.authContext = await this.firebaseIdentityService.resolveVerifiedAuthContext(request.headers);
            return true;
        }

        if (this.firebaseIdentityService.isDevBypassEnabled()) {
            request.authContext = this.mockAuthService.resolveAuthContext(request.headers);
            return true;
        }

        throw new UnauthorizedException('Missing bearer token.');
        return true;
    }
}
