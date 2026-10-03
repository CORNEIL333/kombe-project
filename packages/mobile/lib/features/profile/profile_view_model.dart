import 'package:flutter/foundation.dart';

import '../../core/state/resource.dart';
import '../../domain/entities/profile.dart';
import '../../domain/repositories/profile_repository.dart';

final class ProfileViewModel extends ChangeNotifier {
  ProfileViewModel(this._repository);

  final ProfileRepository _repository;
  Resource<UserProfile> state = const ResourceLoading<UserProfile>();

  Future<void> load() async {
    state = const ResourceLoading<UserProfile>();
    notifyListeners();
    state = await _repository.loadProfile();
    notifyListeners();
  }
}
