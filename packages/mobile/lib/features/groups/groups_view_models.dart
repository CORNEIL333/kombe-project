import 'package:flutter/foundation.dart';

import '../../core/state/resource.dart';
import '../../domain/entities/cycle.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/group_repository.dart';

final class GroupsViewModel extends ChangeNotifier {
  GroupsViewModel(this._repository);
  final GroupRepository _repository;

  Resource<List<GroupSummary>> state = const ResourceLoading<List<GroupSummary>>();

  Future<void> load() async {
    state = const ResourceLoading<List<GroupSummary>>();
    notifyListeners();
    state = await _repository.listGroups();
    notifyListeners();
  }
}

final class GroupDetailViewModel extends ChangeNotifier {
  GroupDetailViewModel(this._repository, this.groupId);
  final GroupRepository _repository;
  final String groupId;

  Resource<GroupDetails> group = const ResourceLoading<GroupDetails>();
  Resource<List<GroupMember>> members = const ResourceLoading<List<GroupMember>>();
  Resource<List<String>> rules = const ResourceLoading<List<String>>();

  Future<void> load() async {
    group = const ResourceLoading<GroupDetails>();
    members = const ResourceLoading<List<GroupMember>>();
    rules = const ResourceLoading<List<String>>();
    notifyListeners();
    final (Resource<GroupDetails>, Resource<List<GroupMember>>, Resource<List<String>>) values =
        await (
          _repository.getGroup(groupId),
          _repository.listMembers(groupId),
          _repository.getRules(groupId),
        ).wait;
    group = values.$1;
    members = values.$2;
    rules = values.$3;
    notifyListeners();
  }
}

final class MembersViewModel extends ChangeNotifier {
  MembersViewModel(this._repository, this.groupId);
  final GroupRepository _repository;
  final String groupId;

  Resource<List<GroupMember>> state = const ResourceLoading<List<GroupMember>>();

  Future<void> load() async {
    state = const ResourceLoading<List<GroupMember>>();
    notifyListeners();
    state = await _repository.listMembers(groupId);
    notifyListeners();
  }
}

final class MemberDetailViewModel extends ChangeNotifier {
  MemberDetailViewModel(this._repository, this.groupId, this.identityId);
  final GroupRepository _repository;
  final String groupId;
  final String identityId;

  Resource<GroupMember> state = const ResourceLoading<GroupMember>();

  Future<void> load() async {
    state = const ResourceLoading<GroupMember>();
    notifyListeners();
    state = await _repository.getMember(groupId, identityId);
    notifyListeners();
  }
}

final class CycleViewModel extends ChangeNotifier {
  CycleViewModel(this._repository, this.groupId);
  final GroupRepository _repository;
  final String groupId;

  Resource<CycleDetails> state = const ResourceLoading<CycleDetails>();

  Future<void> load() async {
    state = const ResourceLoading<CycleDetails>();
    notifyListeners();
    state = await _repository.getCycle(groupId);
    notifyListeners();
  }
}
