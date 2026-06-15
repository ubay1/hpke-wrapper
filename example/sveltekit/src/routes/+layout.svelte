<script>
  import '../app.css';

  let { children } = $props();
</script>

<svelte:head>
  <title>SvelteKit HPKE Demo</title>
  <meta name="description" content="End-to-end encryption with HPKE + SvelteKit" />
</svelte:head>

{@render children()}
