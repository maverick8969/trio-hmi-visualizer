'Initialize so first loop always loads the selected recipe (fixes startup defaulting to recipe 0 without loading)
lastreciperowindex = -1
select_recipe_button = 0

prog_loop:
'Make sure cannot change running parameters while in the middle of automatic run
IF triocontrolword_vr.automode = 0 AND (reciperowindex <> lastreciperowindex OR select_recipe_button = 1) THEN
    select_recipe_button = 0
    GOSUB maprecipedata
    GOSUB maptoeditbuffer
    nip_speed_setpt = pinchroll_speed
ENDIF
IF save_recipe = 1 THEN
    'Normalize boolean recipe parameters (HMI sends TRUE=-1, code expects 0/1)
    IF buffer_zone_control_enable <> 0 THEN buffer_zone_control_enable = 1
    IF buffer_zone_pump_control_enable <> 0 THEN buffer_zone_pump_control_enable = 1
    'Populate table data
    GOSUB mapeditstotable
    'Backup table data in non-volatile memory
    GOSUB update_table_data
    'Change copy table data to selected working VR's even if running in auto to change on the fly
    GOSUB maprecipedata
ENDIF
GOTO prog_loop

maprecipedata:
'Copy selected recipe from table memory to VR memory
IF reciperowindex > -1 THEN
    vr_index = recipe_start_vr
    FOR table_index = reciperowindex TO tabletotalrecipes * tabletotalrecipeitems - 1 STEP tabletotalrecipes
        VR(vr_index) = TABLE(table_index)
        vr_index = vr_index + 1
    NEXT table_index
    'Normalize boolean working VRs (legacy TABLE data may have TRUE=-1)
    IF zone_control_enable <> 0 THEN zone_control_enable = 1
    IF zone_pump_control_enable <> 0 THEN zone_pump_control_enable = 1
ENDIF
lastreciperowindex = reciperowindex
RETURN

maptoeditbuffer:
'Copy the selected row data to edit buffer
IF reciperowindex > -1 THEN
    buffer_index = recipe_edit_buffer_start
    FOR table_index = reciperowindex TO tabletotalrecipes * tabletotalrecipeitems - 1 STEP tabletotalrecipes
        VR(buffer_index) = TABLE(table_index)
        buffer_index = buffer_index + 1
    NEXT table_index
    'Normalize boolean edit buffer VRs (legacy TABLE data may have TRUE=-1)
    IF buffer_zone_control_enable <> 0 THEN buffer_zone_control_enable = 1
    IF buffer_zone_pump_control_enable <> 0 THEN buffer_zone_pump_control_enable = 1
ENDIF
RETURN

mapeditstotable:
'Save buffer edits back to table
IF reciperowindex > -1 THEN
    buffer_index = recipe_edit_buffer_start
    FOR table_index = reciperowindex TO tabletotalrecipes * tabletotalrecipeitems - 1 STEP tabletotalrecipes
        TABLE(table_index, VR(buffer_index))
        buffer_index = buffer_index + 1
    NEXT table_index
ENDIF
save_recipe = 0
RETURN


update_table_data:
'If not auto save TABLE data to flash memory so does not get lost
IF triocontrolword_vr.autorunactive = FALSE THEN
    FLASHTABLE(1,1,0)
    WA(200)
ENDIF
RETURN
