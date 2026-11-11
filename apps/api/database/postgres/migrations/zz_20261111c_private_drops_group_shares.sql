-- "Privat" now means: in no Projekt. Setting an agent or recipe to private
-- deletes its group_content_shares rows (updateAgentSharing /
-- updateTextFormSharing). Before, the rows stayed and merely stopped granting
-- access (every reader requires share_mode <> 'private'); the sharing panel
-- hid them, and the next share into any project promoted the item to 'groups'
-- and silently revived all of them. The panel now lists Projekte always, so
-- such dead rows would show up as shares that do not work.
--
-- These rows grant nothing today and are visible nowhere (group feeds, the
-- chat's project overview and the mention pickers all filter them out), so
-- deleting them changes no access — it only forgets which projects a private
-- item was once in.

DELETE FROM group_content_shares gcs
 USING user_agents ua
 WHERE gcs.content_type = 'user_agents'
   AND gcs.content_id = ua.id::text
   AND ua.share_mode = 'private';

DELETE FROM group_content_shares gcs
 USING user_text_forms tf
 WHERE gcs.content_type = 'user_text_forms'
   AND gcs.content_id = tf.id::text
   AND tf.share_mode = 'private';
