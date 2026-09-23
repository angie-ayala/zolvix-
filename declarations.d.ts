declare module '@angular/core' {
  export const Injectable: any;
}

declare module '@angular/common/http' {
  export class HttpClient {
    post<T>(url: string, body: any): any;
  }
}

declare module 'rxjs' {
  export interface Observable<T> {}
  export function of<T>(value: T): Observable<T>;
}

declare module 'rxjs/operators' {
  export const map: any;
  export const catchError: any;
}

declare module 'tslib' {
}