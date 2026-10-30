import {terminalLink} from './ui.mjs';
import {resultCard} from './result-card.mjs';
export async function showInstallationResult(result,env,{ui,interactiveCard=false}={}){
 const management=result.url.replace(/\/$/,'')+'/'+env.ADMIN_PATH;
 ui?.success('Installation verified');
 console.log('\n  Management:\n  '+terminalLink(management));
 for(const node of result.connections||[])console.log('\n  Connection service:\n  '+terminalLink(node.url));
 console.log('\n  Administrator token (save privately): '+env.ADMIN_TOKEN);
 if(interactiveCard){
  const card=await resultCard({management,token:env.ADMIN_TOKEN,connections:(result.connections||[]).map(n=>n.url)});
  console.log('\n  Private result page:\n  '+terminalLink(card.url));
  console.log('  Explicit --result-page mode: this process stays open for up to 10 minutes. Ctrl+C closes it.');
 }
 console.log('  Links: Ctrl+click in a supported terminal; otherwise copy the URL into your browser.');
 console.log('  Readiness is verified; outbound transport still needs npm run test:live.');
}
