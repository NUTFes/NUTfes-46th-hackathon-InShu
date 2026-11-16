import { sqliteTable, text, integer, real, primaryKey, index } from "drizzle-orm/sqlite-core";
export const staff = sqliteTable("staff", {
 id: text().primaryKey(), slack_user_id: text().notNull().unique(), display_name: text().notNull(), avatar_url: text(),
 is_lead: integer({mode:"boolean"}).notNull().default(false), is_active: integer({mode:"boolean"}).notNull().default(true), created_at: text().notNull(),
});
export const sessions = sqliteTable("sessions", { id:text().primaryKey(), staff_id:text().notNull().references(()=>staff.id,{onDelete:"cascade"}), expires_at:text().notNull(), created_at:text().notNull() });
export const rules = sqliteTable("rules", { id:text().primaryKey(), name:text().notNull(), description:text().notNull(), treatment:text({enum:["replace","blur","warn"]}).notNull(), weight:integer().notNull(), is_active:integer({mode:"boolean"}).notNull().default(true), sort_order:integer().notNull(), updated_by:text().references(()=>staff.id), updated_at:text().notNull() });
export const batches = sqliteTable("batches", { id:text().primaryKey(), staff_id:text().notNull().references(()=>staff.id), photo_count:integer().notNull(), created_at:text().notNull() });
export const photos = sqliteTable("photos", {
 id:text().primaryKey(), batch_id:text().notNull().references(()=>batches.id), staff_id:text().notNull().references(()=>staff.id),
 status:text({enum:["uploaded","detecting","detected","failed","edited","expired"]}).notNull().default("uploaded"),
 original_key:text().notNull(), current_key:text(), width:integer().notNull(), height:integer().notNull(), risk_score:integer(), rules_snapshot:text().notNull().default("[]"), error:text(),
 created_at:text().notNull(), detected_at:text(), edited_at:text(), expires_at:text().notNull(),
},t=>[index("photos_batch_idx").on(t.batch_id)]);
export const findings = sqliteTable("findings", { id:text().primaryKey(), photo_id:text().notNull().references(()=>photos.id,{onDelete:"cascade"}), rule_id:text().notNull().references(()=>rules.id), box:text().notNull(), reason:text().notNull(), confidence:real().notNull(), source:text({enum:["ai","manual"]}).notNull(), status:text({enum:["open","fixed","dismissed"]}).notNull().default("open") },t=>[index("findings_photo_idx").on(t.photo_id)]);
export const edits = sqliteTable("edits", { id:text().primaryKey(), photo_id:text().notNull().references(()=>photos.id,{onDelete:"cascade"}), kind:text({enum:["replace","blur","revert"]}).notNull(), finding_ids:text().notNull(), drink:text(), result_key:text().notNull(), created_by:text().notNull().references(()=>staff.id), created_at:text().notNull(),

 previous_key:text(), previous_findings:text().notNull(), reverted:integer().notNull().default(0)
});
export const usage = sqliteTable("usage", { staff_id:text().notNull().references(()=>staff.id), date:text().notNull(), replace_count:integer().notNull().default(0) },t=>[primaryKey({columns:[t.staff_id,t.date]})]);

export const pendingLogins = sqliteTable("pending_logins", { slack_user_id:text().primaryKey(), display_name:text().notNull(), attempted_at:text().notNull() });
