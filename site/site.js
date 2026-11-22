(() => {
  const toast = document.getElementById("toast");
  let timer;
  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copy);
        toast.textContent = "Command copied to clipboard.";
      } catch {
        toast.textContent =
          "Could not copy automatically. Select the command to copy it.";
      }
      toast.hidden = false;
      clearTimeout(timer);
      timer = setTimeout(() => {
        toast.hidden = true;
      }, 3000);
    });
  });
})();
