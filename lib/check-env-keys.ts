async function main() {
  console.log('Environment keys:', Object.keys(process.env).filter(k => k.toLowerCase().includes('database') || k.toLowerCase().includes('sql') || k.toLowerCase().includes('postgres') || k.toLowerCase().includes('supa')));
}
main();
