// esbuild's Go service otherwise starts one scheduler per logical CPU. Keep
// installer child processes bounded on Windows; explicit operator values win.
export function configureBuildRuntime(env=process.env,platform=process.platform){
 if(platform!=='win32')return;
 env.GOMAXPROCS ||= '2';
 env.GOMEMLIMIT ||= '256MiB';
}
configureBuildRuntime();
