import { Injectable, NgModule } from '@angular/core';
import { MicrofrontendPlatform } from '@scion/microfrontend-platform';
import { ActivatedRouteSnapshot, Resolve, RouterModule, RouterStateSnapshot, Routes } from '@angular/router';

// tag::resolver[]
@Injectable({providedIn: 'root'})
export class PlatformInitializer implements Resolve<void> {

  public resolve(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Promise<void> {
    return MicrofrontendPlatform.connectToHost({symbolicName: 'product-catalog-app'}) // <1>
  }
}

// end::resolver[]

class Microfrontend1Component {
}

class Microfrontend2Component {
}

// tag::resolver-registration[]
const routes: Routes = [
  {
    path: '',
    resolve: {platform: PlatformInitializer}, // <1>
    children: [ // <2>
      {
        path: 'microfrontend-1',
        loadChildren: () => import('./microfrontend-1.module').then(m => m.Microfrontend1Module),
      },
      {
        path: 'microfrontend-2',
        loadChildren: () => import('./microfrontend-2.module').then(m => m.Microfrontend1Module),
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, {useHash: true})],
  exports: [RouterModule],
})
export class AppRoutingModule {
}

// end::resolver-registration[]
