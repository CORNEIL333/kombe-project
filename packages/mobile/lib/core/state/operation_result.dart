sealed class OperationResult<T> {
  const OperationResult();
}

final class OperationSuccess<T> extends OperationResult<T> {
  const OperationSuccess(this.value);
  final T value;
}

final class OperationBlocked<T> extends OperationResult<T> {
  const OperationBlocked(this.reason);
  final String reason;
}

final class OperationFailure<T> extends OperationResult<T> {
  const OperationFailure(this.error);
  final Object error;
}
