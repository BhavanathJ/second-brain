// Shared confirmation dialog - replaces the browser's native confirm()
// with a themed Bootstrap modal. Usage: const ok = await confirmAction('...');

let modalInstance = null;
let modalEl = null;
let resolvePromise = null;

function ensureModal() {
  if (modalEl) return;

  modalEl = document.createElement('div');
  modalEl.className = 'modal fade';
  modalEl.tabIndex = -1;
  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-body" id="confirmDialogMessage"></div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary btn-sm" id="confirmDialogCancel">Cancel</button>
          <button type="button" class="btn btn-danger btn-sm" id="confirmDialogConfirm">Confirm</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);
  modalInstance = new bootstrap.Modal(modalEl);

  modalEl.querySelector('#confirmDialogConfirm').addEventListener('click', () => {
    const resolve = resolvePromise;
    resolvePromise = null; // clear first so hidden.bs.modal below doesn't also resolve
    modalInstance.hide();
    if (resolve) resolve(true);
  });

  modalEl.querySelector('#confirmDialogCancel').addEventListener('click', () => {
    modalInstance.hide(); // triggers hidden.bs.modal -> resolves false
  });

  // Catches Cancel, backdrop click, and Esc key uniformly - anything
  // that closes the modal without going through the Confirm button
  // above (which already nulled resolvePromise) means "false."
  modalEl.addEventListener('hidden.bs.modal', () => {
    if (resolvePromise) {
      const resolve = resolvePromise;
      resolvePromise = null;
      resolve(false);
    }
  });
}

export function confirmAction(message) {
  ensureModal();
  document.getElementById('confirmDialogMessage').textContent = message;
  return new Promise((resolve) => {
    resolvePromise = resolve;
    modalInstance.show();
  });
}