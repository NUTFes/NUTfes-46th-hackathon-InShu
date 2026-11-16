export class HttpError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
export function apiError(status: number, code: string, message: string) { return Response.json({ error: { code, message } }, {status,headers:{"Cache-Control":"no-store"}}); }
export function fail(status:number, message:string, code="validation_error"):never { throw new HttpError(status,code,message); }
