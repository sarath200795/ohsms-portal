import { Module } from '@nestjs/common';
import { FirebaseAuthGuard } from './firebase-auth.guard';
import { FirebaseIdentityService } from './firebase-identity.service';
import { MockFirebaseAuthService } from './mock-firebase-auth.service';

@Module({
    providers: [MockFirebaseAuthService, FirebaseIdentityService, FirebaseAuthGuard],
    exports: [MockFirebaseAuthService, FirebaseIdentityService, FirebaseAuthGuard]
})
export class AuthModule {}
