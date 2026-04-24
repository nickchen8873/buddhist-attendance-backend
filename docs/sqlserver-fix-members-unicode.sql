/*
  目的：
  1) 將 members 中「可能含中文」且目前為 char/varchar/text 的欄位改為 nchar/nvarchar
  2) 自動沿用欄位長度與 NULL/NOT NULL 設定（不用手動猜長度）

  注意：
  - 這個腳本只能防止「未來寫入」被破壞。
  - 已變成 '?' 的歷史資料無法自動還原，需人工或由備份回填。
*/

SET NOCOUNT ON;

BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @dropSql NVARCHAR(MAX) = N'';
  DECLARE @alterSql NVARCHAR(MAX) = N'';
  DECLARE @createSql NVARCHAR(MAX) = N'';
  DECLARE @membersObjId INT = OBJECT_ID(N'dbo.members');

  DECLARE @targetCols TABLE (
    object_id INT,
    column_id INT,
    column_name SYSNAME,
    type_name SYSNAME,
    max_length SMALLINT,
    is_nullable BIT
  );

  DECLARE @targetDefaultConstraints TABLE (
    constraint_name SYSNAME,
    column_name SYSNAME,
    definition NVARCHAR(MAX)
  );

  DECLARE @targetCheckConstraints TABLE (
    constraint_name SYSNAME,
    definition NVARCHAR(MAX)
  );

  INSERT INTO @targetCols (object_id, column_id, column_name, type_name, max_length, is_nullable)
  SELECT
    c.object_id,
    c.column_id,
    c.name AS column_name,
    t.name AS type_name,
    c.max_length,
    c.is_nullable
  FROM sys.columns c
  JOIN sys.types t
    ON c.user_type_id = t.user_type_id
  WHERE c.object_id = @membersObjId
    AND c.name IN (N'name', N'dharma_name', N'gender', N'phone', N'address', N'status', N'group', N'role', N'telephone', N'remark', N'barcode')
    AND t.name IN (N'char', N'varchar', N'text');

  INSERT INTO @targetDefaultConstraints (constraint_name, column_name, definition)
  SELECT
    dc.name AS constraint_name,
    col.name AS column_name,
    dc.definition
  FROM sys.default_constraints dc
  JOIN sys.columns col
    ON col.object_id = dc.parent_object_id
   AND col.column_id = dc.parent_column_id
  JOIN @targetCols tc
    ON tc.object_id = col.object_id
   AND tc.column_id = col.column_id
  WHERE dc.parent_object_id = @membersObjId;

  INSERT INTO @targetCheckConstraints (constraint_name, definition)
  SELECT DISTINCT
    cc.name AS constraint_name,
    cc.definition
  FROM sys.check_constraints cc
  JOIN sys.sql_expression_dependencies sed
    ON sed.referencing_id = cc.object_id
  JOIN @targetCols tc
    ON tc.object_id = sed.referenced_id
   AND tc.column_id = sed.referenced_minor_id
  WHERE cc.parent_object_id = @membersObjId
    AND sed.referenced_id = @membersObjId;

  SELECT @dropSql = @dropSql +
    N'ALTER TABLE dbo.members DROP CONSTRAINT ' + QUOTENAME(constraint_name) + N';' + CHAR(13) + CHAR(10)
  FROM @targetDefaultConstraints;

  SELECT @dropSql = @dropSql +
    N'ALTER TABLE dbo.members DROP CONSTRAINT ' + QUOTENAME(constraint_name) + N';' + CHAR(13) + CHAR(10)
  FROM @targetCheckConstraints;

  SELECT @alterSql = @alterSql +
    N'ALTER TABLE dbo.members ALTER COLUMN ' + QUOTENAME(column_name) + N' ' +
    CASE
      WHEN type_name = N'char' THEN N'nchar(' + CAST(max_length AS NVARCHAR(10)) + N')'
      WHEN type_name = N'varchar' AND max_length = -1 THEN N'nvarchar(max)'
      WHEN type_name = N'varchar' THEN N'nvarchar(' + CAST(max_length AS NVARCHAR(10)) + N')'
      WHEN type_name = N'text' THEN N'nvarchar(max)'
    END + N' ' +
    CASE WHEN is_nullable = 1 THEN N'NULL' ELSE N'NOT NULL' END + N';' + CHAR(13) + CHAR(10)
  FROM @targetCols;

  SELECT @createSql = @createSql +
    N'ALTER TABLE dbo.members ADD CONSTRAINT ' + QUOTENAME(constraint_name) +
    N' DEFAULT ' + definition + N' FOR ' + QUOTENAME(column_name) + N';' + CHAR(13) + CHAR(10)
  FROM @targetDefaultConstraints;

  SELECT @createSql = @createSql +
    N'ALTER TABLE dbo.members WITH CHECK ADD CONSTRAINT ' + QUOTENAME(constraint_name) +
    N' CHECK ' + definition + N';' + CHAR(13) + CHAR(10) +
    N'ALTER TABLE dbo.members CHECK CONSTRAINT ' + QUOTENAME(constraint_name) + N';' + CHAR(13) + CHAR(10)
  FROM @targetCheckConstraints;

  IF LEN(@alterSql) > 0
  BEGIN
    IF LEN(@dropSql) > 0
    BEGIN
      PRINT N'Dropping related constraints:' + CHAR(13) + CHAR(10) + @dropSql;
      EXEC sp_executesql @dropSql;
    END

    PRINT N'Altering columns:' + CHAR(13) + CHAR(10) + @alterSql;
    EXEC sp_executesql @alterSql;

    IF LEN(@createSql) > 0
    BEGIN
      PRINT N'Recreating constraints:' + CHAR(13) + CHAR(10) + @createSql;
      EXEC sp_executesql @createSql;
    END
  END
  ELSE
  BEGIN
    PRINT N'No members columns need conversion (already unicode or not found).';
  END

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
