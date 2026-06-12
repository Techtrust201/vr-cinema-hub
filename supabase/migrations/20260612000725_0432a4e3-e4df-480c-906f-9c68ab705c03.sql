
REVOKE EXECUTE ON FUNCTION public.bump_headset_versions(uuid[], text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_assignments_invalidate() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_playlist_videos_invalidate() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_group_members_invalidate() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_videos_invalidate() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.headsets_for_playlist(uuid) FROM PUBLIC, anon, authenticated;
