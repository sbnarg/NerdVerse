declare const Deno: {env: {get(name:string):string|undefined}; serve(handler:(req:Request)=>Response|Promise<Response>):unknown};
declare const EdgeRuntime: {waitUntil(task:Promise<unknown>):void};
