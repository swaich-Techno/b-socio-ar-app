class WorkerConfigurationError(RuntimeError):
    """Required local runtime/model configuration is unavailable."""


class CustomerInputError(ValueError):
    """The private source image cannot be processed safely."""


class ModelValidationError(RuntimeError):
    """Generated output is technically invalid."""


class LeaseLostError(RuntimeError):
    """The worker no longer owns the atomic job/business lease."""
