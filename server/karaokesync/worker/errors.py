class PipelineError(Exception):
    """A failure with a machine-readable code (translated in the UI).

    `retryable=True` means the job goes back to the queue (with back-off) until
    it runs out of attempts. Problems with the file itself are not retryable.
    """

    def __init__(self, code: str, retryable: bool = True):
        super().__init__(code)
        self.code = code
        self.retryable = retryable


class JobLost(Exception):
    """The worker no longer owns the job (lease expired or project deleted)."""
