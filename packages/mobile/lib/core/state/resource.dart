sealed class Resource<T> {
  const Resource();

  R when<R>({
    required R Function() loading,
    required R Function(T data) ready,
    required R Function() unavailable,
    required R Function(Object error) failure,
  }) {
    final Resource<T> self = this;
    return switch (self) {
      ResourceLoading<T>() => loading(),
      ResourceReady<T>(:final data) => ready(data),
      ResourceUnavailable<T>() => unavailable(),
      ResourceFailure<T>(:final error) => failure(error),
    };
  }
}

final class ResourceLoading<T> extends Resource<T> {
  const ResourceLoading();
}

final class ResourceReady<T> extends Resource<T> {
  const ResourceReady(this.data);
  final T data;
}

final class ResourceUnavailable<T> extends Resource<T> {
  const ResourceUnavailable();
}

final class ResourceFailure<T> extends Resource<T> {
  const ResourceFailure(this.error);
  final Object error;
}
