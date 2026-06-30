import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

/**
 * A 401 response to a request carrying an Authorization header means that the
 * locally stored session can no longer be trusted. Login/register requests do
 * not carry this header, so an invalid password does not trigger logout.
 */
export const authExpiryInterceptor: HttpInterceptorFn = (request, next) =>
  next(request).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && request.headers.has('Authorization')) {
        window.dispatchEvent(new CustomEvent('documentchain:session-expired'));
      }

      return throwError(() => error);
    }),
  );
