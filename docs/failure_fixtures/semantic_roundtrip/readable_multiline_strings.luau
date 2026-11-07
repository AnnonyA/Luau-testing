-- The decompiler may render long two-line messages with long brackets. The
-- runtime comparison observes the exact bytes, including UTF-8 and delimiters.
local messages = {
    "This is a longer message with a ]] delimiter.\nPlease try again or contact support.",
    "The first line contains a ]=] delimiter.\nThe second line ends with a bracket ]",
    "éééééééééééééééééééééééé\néééééééééééééééééééééééé",
    "A long format string contains %s here.\nThis second line is also long enough.",
    "A long line ending in a carriage return.\r\nThis second line is also long enough.",
}
for _, message in ipairs(messages) do
    print(#message)
    for index = 1, #message do
        print(string.byte(message, index))
    end
end
