// ==========================================
// CHAT HUB
// Supabase + Private Chat + Group Chat
// ==========================================

// ==========================================
// SUPABASE CONNECTION
// ==========================================

const SUPABASE_URL =
    "https://tqedgpapfslnhxavlivu.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_6bWIsy2wN0L6k1ocp6eOQA_AMITaJLe";

const supabaseClient =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    );


// ==========================================
// VARIABLES
// ==========================================

let currentUser = null;
let currentProfile = null;
let currentConversation = null;
let currentGroup = null;
let realtimeChannel = null;
let renderedMessageIds = new Set();


// ==========================================
// IN-APP NOTIFICATIONS
// ==========================================

let notificationContainer = null;


function createNotificationContainer() {

    if (notificationContainer) {
        return notificationContainer;
    }

    notificationContainer =
        document.createElement("div");

    notificationContainer.id =
        "chatHubNotifications";

    notificationContainer.style.position =
        "fixed";

    notificationContainer.style.top =
        "20px";

    notificationContainer.style.right =
        "20px";

    notificationContainer.style.zIndex =
        "99999";

    notificationContainer.style.display =
        "flex";

    notificationContainer.style.flexDirection =
        "column";

    notificationContainer.style.gap =
        "10px";

    notificationContainer.style.width =
        "min(340px, calc(100vw - 40px))";

    notificationContainer.style.pointerEvents =
        "none";

    document.body.appendChild(
        notificationContainer
    );

    return notificationContainer;
}


function showNotification(
    title,
    message,
    type = "received"
) {

    const container =
        createNotificationContainer();

    const notification =
        document.createElement("div");

    notification.style.pointerEvents =
        "auto";

    notification.style.padding =
        "12px 15px";

    notification.style.borderRadius =
        "12px";

    notification.style.background =
        "#ffffff";

    notification.style.color =
        "#222222";

    notification.style.boxShadow =
        "0 8px 25px rgba(0,0,0,0.18)";

    notification.style.border =
        "1px solid rgba(0,0,0,0.08)";

    notification.style.cursor =
        "pointer";

    notification.style.fontFamily =
        "Arial, sans-serif";

    notification.style.opacity =
        "0";

    notification.style.transform =
        "translateX(20px)";

    notification.style.transition =
        "opacity 0.2s ease, transform 0.2s ease";

    const icon =
        type === "sent"
            ? "✓"
            : "🔔";

    notification.innerHTML = `
        <div style="
            font-weight:700;
            font-size:14px;
            margin-bottom:4px;
        ">
            ${icon} ${escapeHTML(title || "Chat Hub")}
        </div>

        <div style="
            font-size:13px;
            line-height:1.4;
            word-break:break-word;
        ">
            ${escapeHTML(message || "")}
        </div>
    `;

    notification.onclick =
        function () {

            notification.remove();

            window.focus();
        };

    container.appendChild(
        notification
    );

    requestAnimationFrame(() => {

        notification.style.opacity =
            "1";

        notification.style.transform =
            "translateX(0)";
    });

    setTimeout(() => {

        notification.style.opacity =
            "0";

        notification.style.transform =
            "translateX(20px)";

        setTimeout(() => {

            notification.remove();

        }, 250);

    }, type === "sent" ? 2200 : 5000);
}


function isCurrentChatMessage(message) {

    if (!message) {
        return false;
    }

    if (
        message.conversation_id &&
        currentConversation
    ) {

        return (
            message.conversation_id ===
            currentConversation.id
        );
    }

    if (
        message.group_id &&
        currentGroup
    ) {

        return (
            message.group_id ===
            currentGroup.id
        );
    }

    return false;
}


async function getIncomingMessageInfo(message) {

    if (
        !currentUser ||
        !message ||
        message.sender_id === currentUser.id
    ) {

        return null;
    }


    // ==========================================
    // PRIVATE MESSAGE
    // ==========================================

    if (message.conversation_id) {

        const {
            data: conversation,
            error: conversationError
        } = await supabaseClient
            .from("conversations")
            .select(
                "id,user1_id,user2_id"
            )
            .eq(
                "id",
                message.conversation_id
            )
            .maybeSingle();

        if (
            conversationError ||
            !conversation
        ) {

            return null;
        }

        if (
            conversation.user1_id !==
                currentUser.id &&
            conversation.user2_id !==
                currentUser.id
        ) {

            return null;
        }

        const {
            data: sender
        } = await supabaseClient
            .from("profiles")
            .select(
                "id,name,email"
            )
            .eq(
                "id",
                message.sender_id
            )
            .maybeSingle();

        return {

            type: "private",

            title:
                sender?.name ||
                sender?.email ||
                "New message",

            text:
                message.message ||
                "New message",

            conversation:
                conversation,

            sender:
                sender
        };
    }


    // ==========================================
    // GROUP MESSAGE
    // ==========================================

    if (message.group_id) {

        const {
            data: membership,
            error: membershipError
        } = await supabaseClient
            .from("group_members")
            .select(
                "group_id,user_id"
            )
            .eq(
                "group_id",
                message.group_id
            )
            .eq(
                "user_id",
                currentUser.id
            )
            .maybeSingle();

        if (
            membershipError ||
            !membership
        ) {

            return null;
        }

        const {
            data: group
        } = await supabaseClient
            .from("groups")
            .select(
                "id,name,created_by"
            )
            .eq(
                "id",
                message.group_id
            )
            .maybeSingle();

        const {
            data: sender
        } = await supabaseClient
            .from("profiles")
            .select(
                "id,name,email"
            )
            .eq(
                "id",
                message.sender_id
            )
            .maybeSingle();

        return {

            type: "group",

            title:
                group?.name ||
                "Group message",

            text:
                (sender?.name ||
                 sender?.email ||
                 "Someone") +
                ": " +
                (message.message ||
                 "New message"),

            group:
                group,

            sender:
                sender
        };
    }

    return null;
}


// ==========================================
// REAL-TIME CHAT
// ==========================================

async function cleanupRealtimeSubscription() {

    if (!realtimeChannel) {
        return;
    }

    try {

        await supabaseClient
            .removeChannel(
                realtimeChannel
            );

    } catch (error) {

        console.error(
            "REALTIME CLEANUP ERROR:",
            error
        );
    }

    realtimeChannel = null;
}


async function subscribeToCurrentChat() {

    await cleanupRealtimeSubscription();

    if (!currentUser) {
        return;
    }

    realtimeChannel =
        supabaseClient
            .channel(
                "chat-messages-" +
                Date.now() +
                "-" +
                Math.random()
                    .toString(36)
                    .slice(2)
            )
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "messages"
                },
                async payload => {

                    const message =
                        payload.new;

                    if (
                        !message ||
                        !currentUser
                    ) {
                        return;
                    }

                    // Do not display your own
                    // message twice.
                    if (
                        message.sender_id ===
                        currentUser.id
                    ) {
                        return;
                    }

                    const info =
                        await getIncomingMessageInfo(
                            message
                        );

                    if (!info) {
                        return;
                    }

                    // If the user is already
                    // inside this chat, display
                    // the message normally.
                    if (
                        isCurrentChatMessage(
                            message
                        )
                    ) {

                        displayMessage(
                            message
                        );

                        const messagesBox =
                            document.getElementById(
                                "messages"
                            );

                        if (messagesBox) {

                            messagesBox.scrollTop =
                                messagesBox.scrollHeight;
                        }

                        return;
                    }

                    // Message belongs to another
                    // conversation or group.
                    showNotification(
                        info.title,
                        info.text,
                        "received"
                    );
                }
            )
            .subscribe(status => {

                if (
                    status ===
                    "CHANNEL_ERROR"
                ) {

                    console.error(
                        "REALTIME CHANNEL ERROR"
                    );
                }

                if (
                    status ===
                    "TIMED_OUT"
                ) {

                    console.error(
                        "REALTIME CHANNEL TIMED OUT"
                    );
                }
            });
}


// ==========================================
// LOGIN / SIGN UP SCREENS
// ==========================================

function showLogin() {

    document.getElementById(
        "loginForm"
    ).style.display = "block";

    document.getElementById(
        "signupForm"
    ).style.display = "none";
}


function showSignup() {

    document.getElementById(
        "loginForm"
    ).style.display = "none";

    document.getElementById(
        "signupForm"
    ).style.display = "block";
}


// ==========================================
// SIGN UP
// ==========================================

async function signup() {

    const name =
        document.getElementById(
            "signupName"
        ).value.trim();

    const email =
        document.getElementById(
            "signupEmail"
        ).value.trim();

    const password =
        document.getElementById(
            "signupPassword"
        ).value;

    if (
        !name ||
        !email ||
        !password
    ) {

        alert(
            "Please fill in all fields."
        );

        return;
    }

    if (password.length < 6) {

        alert(
            "Password must be at least 6 characters."
        );

        return;
    }

    try {

        const {
            data,
            error
        } =
            await supabaseClient.auth.signUp({
                email: email,
                password: password
            });

        if (error) {

            alert(error.message);

            return;
        }

        if (!data.user) {

            alert(
                "Account creation failed."
            );

            return;
        }

        const {
            error: profileError
        } =
            await supabaseClient
                .from("profiles")
                .insert({

                    id:
                        data.user.id,

                    name:
                        name,

                    email:
                        email.toLowerCase()
                });

        if (profileError) {

            console.error(
                profileError
            );

            alert(
                "Account created, but your profile could not be saved."
            );

            return;
        }

        currentUser =
            data.user;

        currentProfile = {

            id:
                data.user.id,

            name:
                name,

            email:
                email.toLowerCase()
        };

        if (data.session) {

            await showChatScreen();

        } else {

            alert(
                "Account created! Please sign in."
            );

            showLogin();
        }

    } catch (error) {

        console.error(error);

        alert(
            "Something went wrong while creating your account."
        );
    }
}


// ==========================================
// LOGIN
// ==========================================

async function login() {

    const email =
        document.getElementById(
            "loginEmail"
        ).value.trim();

    const password =
        document.getElementById(
            "loginPassword"
        ).value;

    if (!email || !password) {

        alert(
            "Please enter your email and password."
        );

        return;
    }

    try {

        const {
            data,
            error
        } =
            await supabaseClient.auth
                .signInWithPassword({

                    email:
                        email,

                    password:
                        password
                });

        if (error) {

            console.error(
                "LOGIN ERROR:",
                error
            );

            alert(
                error.message
            );

            return;
        }

        currentUser =
            data.user;

        await showChatScreen();

    } catch (error) {

        console.error(error);

        alert(
            "Unable to log in."
        );
    }
}


// ==========================================
// SHOW CHAT SCREEN
// ==========================================

async function showChatScreen() {

    document.getElementById(
        "authScreen"
    ).style.display = "none";

    document.getElementById(
        "chatScreen"
    ).style.display = "flex";

    await loadProfile();

    await loadConversations();

    await loadGroups();

    await subscribeToCurrentChat();
}


// ==========================================
// LOAD PROFILE
// ==========================================

async function loadProfile() {

    if (!currentUser) {
        return;
    }

    const {
        data,
        error
    } =
        await supabaseClient
            .from("profiles")
            .select("*")
            .eq(
                "id",
                currentUser.id
            )
            .single();

    if (error) {

        console.error(
            "PROFILE ERROR:",
            error
        );

        return;
    }

    currentProfile =
        data;

    document.getElementById(
        "currentUserName"
    ).textContent =
        data.name ||
        "User";
}


// ==========================================
// LOGOUT
// ==========================================

async function logout() {

    await cleanupRealtimeSubscription();

    await supabaseClient.auth.signOut();

    currentUser = null;

    currentProfile = null;

    currentConversation = null;

    currentGroup = null;

    if (notificationContainer) {

        notificationContainer.remove();

        notificationContainer =
            null;
    }

    document.getElementById(
        "chatScreen"
    ).style.display = "none";

    document.getElementById(
        "authScreen"
    ).style.display = "flex";

    document.getElementById(
        "loginEmail"
    ).value = "";

    document.getElementById(
        "loginPassword"
    ).value = "";
}


// ==========================================
// LOAD PRIVATE CONVERSATIONS
// ==========================================

async function loadConversations() {

    if (!currentUser) {
        return;
    }

    const privateChats =
        document.getElementById(
            "privateChats"
        );

    privateChats.innerHTML = "";

    const {
        data,
        error
    } =
        await supabaseClient
            .from("conversations")
            .select("*")
            .or(
                `user1_id.eq.${currentUser.id},user2_id.eq.${currentUser.id}`
            )
            .order(
                "created_at",
                {
                    ascending: false
                }
            );

    if (error) {

        console.error(
            "CONVERSATION ERROR:",
            error
        );

        privateChats.innerHTML =
            `
            <div class="empty-conversations">
                Unable to load conversations.
            </div>
            `;

        return;
    }

    if (
        !data ||
        data.length === 0
    ) {

        privateChats.innerHTML =
            `
            <div class="empty-conversations">
                No conversations yet.
            </div>
            `;

        return;
    }

    for (
        const conversation
        of data
    ) {

        const otherUserId =
            conversation.user1_id ===
            currentUser.id

                ? conversation.user2_id

                : conversation.user1_id;

        const {
            data: otherProfile
        } =
            await supabaseClient
                .from("profiles")
                .select(
                    "id,name,email"
                )
                .eq(
                    "id",
                    otherUserId
                )
                .single();

        if (!otherProfile) {
            continue;
        }

        const item =
            document.createElement(
                "div"
            );

        item.className =
            "conversation-item";

        item.innerHTML = `
            <div class="avatar">
                👤
            </div>

            <div class="conversation-info">

                <strong>
                    ${escapeHTML(
                        otherProfile.name ||
                        "User"
                    )}
                </strong>

                <small>
                    ${escapeHTML(
                        otherProfile.email ||
                        ""
                    )}
                </small>

            </div>
        `;

        item.onclick =
            function () {

                openPrivateChat(
                    conversation,
                    otherProfile
                );
            };

        privateChats.appendChild(
            item
        );
    }
}


// ==========================================
// NEW PRIVATE CONVERSATION
// ==========================================

async function newConversation() {

    if (!currentUser) {
        return;
    }

    const email =
        prompt(
            "Enter the email address of the person you want to chat with:"
        );

    if (!email) {
        return;
    }

    const cleanEmail =
        email
            .trim()
            .toLowerCase();

    if (
        currentProfile &&
        cleanEmail ===
            currentProfile.email
                .toLowerCase()
    ) {

        alert(
            "You cannot start a conversation with yourself."
        );

        return;
    }

    const {
        data: otherProfile,
        error
    } =
        await supabaseClient
            .from("profiles")
            .select("*")
            .ilike(
                "email",
                cleanEmail
            )
            .maybeSingle();

    if (error) {

        console.error(
            "USER SEARCH ERROR:",
            error
        );

        alert(
            "Could not search for that user."
        );

        return;
    }

    if (!otherProfile) {

        alert(
            "No user with that email was found."
        );

        return;
    }

    const {
        data: existing
    } =
        await supabaseClient
            .from("conversations")
            .select("*")
            .or(
                `and(user1_id.eq.${currentUser.id},user2_id.eq.${otherProfile.id}),and(user1_id.eq.${otherProfile.id},user2_id.eq.${currentUser.id})`
            )
            .maybeSingle();

    if (existing) {

        openPrivateChat(
            existing,
            otherProfile
        );

        return;
    }

    const {
        data: conversation,
        error: createError
    } =
        await supabaseClient
            .from("conversations")
            .insert({

                user1_id:
                    currentUser.id,

                user2_id:
                    otherProfile.id
            })
            .select()
            .single();

    if (createError) {

        console.error(
            "CREATE CONVERSATION ERROR:",
            createError
        );

        alert(
            "Could not create conversation: " +
            createError.message
        );

        return;
    }

    await loadConversations();

    openPrivateChat(
        conversation,
        otherProfile
    );
}


// ==========================================
// OPEN PRIVATE CHAT
// ==========================================

async function openPrivateChat(
    conversation,
    otherProfile
) {

    currentConversation =
        conversation;

    currentGroup =
        null;

    removeGroupControls();

    document.getElementById(
        "conversationName"
    ).textContent =
        otherProfile.name ||
        "User";

    document.getElementById(
        "conversationStatus"
    ).textContent =
        "Private conversation";

    document.getElementById(
        "conversationAvatar"
    ).textContent =
        "👤";

    document.getElementById(
        "messageInput"
    ).disabled =
        false;

    document.getElementById(
        "sendButton"
    ).disabled =
        false;

    await loadMessages();

    await subscribeToCurrentChat();
}


// ==========================================
// LOAD PRIVATE MESSAGES
// ==========================================

async function loadMessages() {

    if (!currentConversation) {
        return;
    }

    const messagesBox =
        document.getElementById(
            "messages"
        );

    renderedMessageIds.clear();

    messagesBox.innerHTML =
        "";

    const {
        data,
        error
    } =
        await supabaseClient
            .from("messages")
            .select("*")
            .eq(
                "conversation_id",
                currentConversation.id
            )
            .order(
                "created_at",
                {
                    ascending: true
                }
            );

    if (error) {

        console.error(
            "MESSAGE ERROR:",
            error
        );

        messagesBox.innerHTML = `
            <div class="welcome-panel">

                <div class="welcome-icon">
                    ⚠
                </div>

                <h2>
                    Unable to load messages
                </h2>

                <p>
                    ${escapeHTML(
                        error.message ||
                        "Unknown error"
                    )}
                </p>

            </div>
        `;

        return;
    }

    if (
        !data ||
        data.length === 0
    ) {

        messagesBox.innerHTML = `
            <div class="welcome-panel">

                <div class="welcome-icon">
                    ✦
                </div>

                <h2>
                    Start the conversation
                </h2>

                <p>
                    Send your first message.
                </p>

            </div>
        `;

        return;
    }

    data.forEach(
        message => {

            displayMessage(
                message
            );
        }
    );

    messagesBox.scrollTop =
        messagesBox.scrollHeight;
}


// ==========================================
// CREATE GROUP
// ==========================================

async function newGroup() {

    if (!currentUser) {
        return;
    }

    const groupName =
        prompt(
            "Enter a name for your group:"
        );

    if (
        !groupName ||
        !groupName.trim()
    ) {
        return;
    }

    const cleanName =
        groupName.trim();

    const {
        data: group,
        error: groupError
    } =
        await supabaseClient
            .from("groups")
            .insert({

                name:
                    cleanName,

                created_by:
                    currentUser.id
            })
            .select()
            .single();

    if (groupError) {

        console.error(
            "CREATE GROUP ERROR:",
            groupError
        );

        alert(
            "Could not create group: " +
            groupError.message
        );

        return;
    }

    const {
        error: memberError
    } =
        await supabaseClient
            .from("group_members")
            .insert({

                group_id:
                    group.id,

                user_id:
                    currentUser.id
            });

    if (memberError) {

        console.error(
            "ADD GROUP MEMBER ERROR:",
            memberError
        );

        alert(
            "Group was created, but you could not be added to it."
        );

        return;
    }

    alert(
        "Group created successfully!"
    );

    await loadGroups();
}


// ==========================================
// LOAD GROUPS
// ==========================================

async function loadGroups() {

    if (!currentUser) {
        return;
    }

    const groupChats =
        document.getElementById(
            "groupChats"
        );

    groupChats.innerHTML =
        "";

    const {
        data: memberships,
        error: membershipError
    } =
        await supabaseClient
            .from("group_members")
            .select("group_id")
            .eq(
                "user_id",
                currentUser.id
            );

    if (membershipError) {

        console.error(
            "GROUP MEMBERS ERROR:",
            membershipError
        );

        groupChats.innerHTML = `
            <div class="empty-conversations">
                Unable to load groups.
            </div>
        `;

        return;
    }

    if (
        !memberships ||
        memberships.length === 0
    ) {

        groupChats.innerHTML = `
            <div class="empty-conversations">
                No groups yet.
            </div>
        `;

        return;
    }

    const groupIds =
        memberships.map(
            member =>
                member.group_id
        );

    const {
        data: groups,
        error: groupError
    } =
        await supabaseClient
            .from("groups")
            .select("*")
            .in(
                "id",
                groupIds
            )
            .order(
                "created_at",
                {
                    ascending: false
                }
            );

    if (groupError) {

        console.error(
            "GROUP LOAD ERROR:",
            groupError
        );

        groupChats.innerHTML = `
            <div class="empty-conversations">
                Unable to load groups.
            </div>
        `;

        return;
    }

    if (
        !groups ||
        groups.length === 0
    ) {

        groupChats.innerHTML = `
            <div class="empty-conversations">
                No groups yet.
            </div>
        `;

        return;
    }

    groups.forEach(
        group => {

            const item =
                document.createElement(
                    "div"
                );

            item.className =
                "conversation-item";

            item.innerHTML = `
                <div class="avatar">
                    👥
                </div>

                <div class="conversation-info">

                    <strong>
                        ${escapeHTML(
                            group.name
                        )}
                    </strong>

                    <small>
                        Group
                    </small>

                </div>
            `;

            item.onclick =
                function () {

                    openGroupChat(
                        group
                    );
                };

            groupChats.appendChild(
                item
            );
        }
    );
}
// ==========================================
// OPEN GROUP CHAT
// ==========================================

async function openGroupChat(group) {

    currentGroup = group;

    currentConversation = null;

    document.getElementById(
        "conversationName"
    ).textContent =
        group.name;

    document.getElementById(
        "conversationStatus"
    ).textContent =
        "Group conversation";

    document.getElementById(
        "conversationAvatar"
    ).textContent =
        "👥";

    document.getElementById(
        "messageInput"
    ).disabled =
        false;

    document.getElementById(
        "sendButton"
    ).disabled =
        false;

    // Add group controls
    createGroupControls();

    await loadGroupMembers();

    await loadGroupMessages();

    await subscribeToCurrentChat();
}


// ==========================================
// GROUP CONTROLS
// ==========================================

function createGroupControls() {

    removeGroupControls();

    const nameElement =
        document.getElementById(
            "conversationName"
        );

    if (
        !nameElement ||
        !currentGroup
    ) {
        return;
    }

    const container =
        document.createElement(
            "div"
        );

    container.id =
        "groupControls";

    container.style.marginTop =
        "8px";

    container.style.display =
        "flex";

    container.style.gap =
        "8px";

    container.style.alignItems =
        "center";

    container.style.flexWrap =
        "wrap";


    // ==========================================
    // ADD MEMBERS BUTTON
    // ==========================================

    const addButton =
        document.createElement(
            "button"
        );

    addButton.type =
        "button";

    addButton.textContent =
        "👥 Add Members";

    addButton.style.cursor =
        "pointer";

    addButton.style.padding =
        "6px 10px";

    addButton.style.borderRadius =
        "8px";

    addButton.style.border =
        "none";

    addButton.onclick =
        addGroupMember;


    // ==========================================
    // VIEW MEMBERS BUTTON
    // ==========================================

    const membersButton =
        document.createElement(
            "button"
        );

    membersButton.type =
        "button";

    membersButton.textContent =
        "View Members";

    membersButton.style.cursor =
        "pointer";

    membersButton.style.padding =
        "6px 10px";

    membersButton.style.borderRadius =
        "8px";

    membersButton.style.border =
        "none";

    membersButton.onclick =
        showGroupMembers;


    container.appendChild(
        addButton
    );

    container.appendChild(
        membersButton
    );


    // ==========================================
    // DELETE GROUP BUTTON
    // ==========================================

    // Only the group creator gets
    // the delete option.

    if (
        currentGroup.created_by ===
        currentUser.id
    ) {

        const deleteButton =
            document.createElement(
                "button"
            );

        deleteButton.type =
            "button";

        deleteButton.textContent =
            "🗑️ Delete Group";

        deleteButton.style.cursor =
            "pointer";

        deleteButton.style.padding =
            "6px 10px";

        deleteButton.style.borderRadius =
            "8px";

        deleteButton.style.border =
            "none";

        deleteButton.onclick =
            deleteCurrentGroup;

        container.appendChild(
            deleteButton
        );
    }

    nameElement.parentNode.appendChild(
        container
    );
}


// ==========================================
// REMOVE GROUP CONTROLS
// ==========================================

function removeGroupControls() {

    const controls =
        document.getElementById(
            "groupControls"
        );

    if (controls) {
        controls.remove();
    }


    const memberBox =
        document.getElementById(
            "groupMembersBox"
        );

    if (memberBox) {
        memberBox.remove();
    }
}


// ==========================================
// ADD GROUP MEMBER
// ==========================================

async function addGroupMember() {

    if (
        !currentUser ||
        !currentGroup
    ) {

        alert(
            "Please open a group first."
        );

        return;
    }

    const email =
        prompt(
            "Enter the email address of the person you want to add:"
        );

    if (!email) {
        return;
    }

    const cleanEmail =
        email
            .trim()
            .toLowerCase();


    // ==========================================
    // FIND USER
    // ==========================================

    const {
        data: profile,
        error: searchError
    } =
        await supabaseClient
            .from("profiles")
            .select(
                "id,name,email"
            )
            .ilike(
                "email",
                cleanEmail
            )
            .maybeSingle();

    if (searchError) {

        console.error(
            "GROUP USER SEARCH ERROR:",
            searchError
        );

        alert(
            "Could not search for that user: " +
            searchError.message
        );

        return;
    }

    if (!profile) {

        alert(
            "No user with that email was found."
        );

        return;
    }


    // ==========================================
    // CHECK SELF
    // ==========================================

    if (
        profile.id ===
        currentUser.id
    ) {

        alert(
            "You are already a member of this group."
        );

        return;
    }


    // ==========================================
    // CHECK EXISTING MEMBER
    // ==========================================

    const {
        data: existingMember,
        error: existingError
    } =
        await supabaseClient
            .from("group_members")
            .select(
                "group_id,user_id"
            )
            .eq(
                "group_id",
                currentGroup.id
            )
            .eq(
                "user_id",
                profile.id
            )
            .maybeSingle();

    if (existingError) {

        console.error(
            "CHECK MEMBER ERROR:",
            existingError
        );

        alert(
            "Could not check group membership: " +
            existingError.message
        );

        return;
    }

    if (existingMember) {

        alert(
            profile.name +
            " is already a member of this group."
        );

        return;
    }


    // ==========================================
    // ADD MEMBER
    // ==========================================

    const {
        error: insertError
    } =
        await supabaseClient
            .from("group_members")
            .insert({

                group_id:
                    currentGroup.id,

                user_id:
                    profile.id
            });

    if (insertError) {

        console.error(
            "ADD MEMBER ERROR:",
            insertError
        );

        alert(
            "Could not add member: " +
            insertError.message
        );

        return;
    }

    alert(
        profile.name +
        " has been added to the group!"
    );

    await loadGroupMembers();
}


// ==========================================
// LOAD GROUP MEMBERS
// ==========================================

async function loadGroupMembers() {

    if (!currentGroup) {
        return;
    }

    const {
        data: members,
        error
    } =
        await supabaseClient
            .from("group_members")
            .select("user_id")
            .eq(
                "group_id",
                currentGroup.id
            );

    if (error) {

        console.error(
            "LOAD GROUP MEMBERS ERROR:",
            error
        );

        return;
    }

    const memberIds =
        members.map(
            member =>
                member.user_id
        );

    if (
        memberIds.length === 0
    ) {
        return;
    }

    const {
        data: profiles,
        error: profileError
    } =
        await supabaseClient
            .from("profiles")
            .select(
                "id,name,email"
            )
            .in(
                "id",
                memberIds
            );

    if (profileError) {

        console.error(
            "LOAD MEMBER PROFILES ERROR:",
            profileError
        );

        return;
    }

    showMembersBox(
        profiles || []
    );
}


// ==========================================
// SHOW GROUP MEMBERS
// ==========================================

function showGroupMembers() {

    loadGroupMembers();
}


// ==========================================
// MEMBER DISPLAY
// ==========================================

function showMembersBox(profiles) {

    let box =
        document.getElementById(
            "groupMembersBox"
        );

    if (!box) {

        box =
            document.createElement(
                "div"
            );

        box.id =
            "groupMembersBox";

        box.style.padding =
            "10px";

        box.style.marginTop =
            "8px";

        box.style.borderRadius =
            "10px";

        box.style.background =
            "rgba(255,255,255,0.08)";


        const nameElement =
            document.getElementById(
                "conversationName"
            );

        if (nameElement) {

            nameElement.parentNode.appendChild(
                box
            );
        }
    }

    box.innerHTML =
        "<strong>Group Members</strong>";


    profiles.forEach(
        profile => {

            const member =
                document.createElement(
                    "div"
                );

            member.style.marginTop =
                "8px";

            member.style.display =
                "flex";

            member.style.alignItems =
                "center";

            member.style.justifyContent =
                "space-between";

            member.style.gap =
                "8px";


            const label =
                document.createElement(
                    "span"
                );

            label.textContent =
                "👤 " +
                (
                    profile.name ||
                    "User"
                ) +
                " — " +
                (
                    profile.email ||
                    ""
                );

            member.appendChild(
                label
            );


            // ==========================================
            // REMOVE MEMBER BUTTON
            // ==========================================

            if (
                currentGroup &&
                currentGroup.created_by ===
                    currentUser.id &&
                profile.id !==
                    currentUser.id
            ) {

                const removeButton =
                    document.createElement(
                        "button"
                    );

                removeButton.type =
                    "button";

                removeButton.textContent =
                    "Remove";

                removeButton.style.cursor =
                    "pointer";

                removeButton.style.padding =
                    "4px 8px";

                removeButton.style.borderRadius =
                    "6px";

                removeButton.style.border =
                    "none";

                removeButton.onclick =
                    function () {

                        removeGroupMember(
                            profile
                        );
                    };

                member.appendChild(
                    removeButton
                );
            }

            box.appendChild(
                member
            );
        }
    );
}


// ==========================================
// REMOVE GROUP MEMBER
// ==========================================

async function removeGroupMember(
    profile
) {

    if (
        !currentUser ||
        !currentGroup
    ) {
        return;
    }

    if (
        currentGroup.created_by !==
        currentUser.id
    ) {

        alert(
            "Only the group creator can remove members."
        );

        return;
    }

    if (
        profile.id ===
        currentUser.id
    ) {

        alert(
            "The group creator cannot remove themselves."
        );

        return;
    }

    const confirmed =
        confirm(
            "Remove " +
            (
                profile.name ||
                profile.email
            ) +
            " from this group?"
        );

    if (!confirmed) {
        return;
    }


    const {
        data,
        error
    } =
        await supabaseClient.rpc(
            "remove_group_member",
            {
                group_id_to_change:
                    currentGroup.id,

                member_id_to_remove:
                    profile.id
            }
        );

    if (error) {

        console.error(
            "REMOVE MEMBER ERROR:",
            error
        );

        alert(
            "Could not remove member: " +
            error.message
        );

        return;
    }

    alert(
        (
            profile.name ||
            "Member"
        ) +
        " has been removed from the group."
    );

    await loadGroupMembers();
}


// ==========================================
// DELETE GROUP
// ==========================================

async function deleteCurrentGroup() {

    if (
        !currentUser ||
        !currentGroup
    ) {
        return;
    }

    if (
        currentGroup.created_by !==
        currentUser.id
    ) {

        alert(
            "Only the group creator can delete the group."
        );

        return;
    }

    const confirmed =
        confirm(
            "Delete \"" +
            currentGroup.name +
            "\"? This will permanently delete the group, its members, and its group messages."
        );

    if (!confirmed) {
        return;
    }

    const groupId =
        currentGroup.id;


    const {
        error
    } =
        await supabaseClient.rpc(
            "delete_group",
            {
                group_id_to_delete:
                    groupId
            }
        );

    if (error) {

        console.error(
            "DELETE GROUP ERROR:",
            error
        );

        alert(
            "Could not delete group: " +
            error.message
        );

        return;
    }

    await cleanupRealtimeSubscription();

    currentGroup = null;

    currentConversation = null;

    removeGroupControls();

    document.getElementById(
        "conversationName"
    ).textContent =
        "Chat Hub";

    document.getElementById(
        "conversationStatus"
    ).textContent =
        "Select a conversation";

    document.getElementById(
        "conversationAvatar"
    ).textContent =
        "💬";

    document.getElementById(
        "messages"
    ).innerHTML = `
        <div class="welcome-panel">

            <div class="welcome-icon">
                ✦
            </div>

            <h2>
                Group deleted
            </h2>

            <p>
                The group and its messages have been deleted.
            </p>

        </div>
    `;

    document.getElementById(
        "messageInput"
    ).disabled =
        true;

    document.getElementById(
        "sendButton"
    ).disabled =
        true;

    await loadGroups();
}


// ==========================================
// LOAD GROUP MESSAGES
// ==========================================

async function loadGroupMessages() {

    if (!currentGroup) {
        return;
    }

    const messagesBox =
        document.getElementById(
            "messages"
        );

    renderedMessageIds.clear();

    messagesBox.innerHTML =
        "";

    const {
        data,
        error
    } =
        await supabaseClient
            .from("messages")
            .select("*")
            .eq(
                "group_id",
                currentGroup.id
            )
            .order(
                "created_at",
                {
                    ascending: true
                }
            );

    if (error) {

        console.error(
            "GROUP MESSAGE ERROR:",
            error
        );

        messagesBox.innerHTML = `
            <div class="welcome-panel">

                <div class="welcome-icon">
                    ⚠
                </div>

                <h2>
                    Unable to load group messages
                </h2>

                <p>
                    ${escapeHTML(
                        error.message ||
                        "Unknown error"
                    )}
                </p>

            </div>
        `;

        return;
    }

    if (
        !data ||
        data.length === 0
    ) {

        messagesBox.innerHTML = `
            <div class="welcome-panel">

                <div class="welcome-icon">
                    👥
                </div>

                <h2>
                    Start the group conversation
                </h2>

                <p>
                    Send the first message.
                </p>

            </div>
        `;

        return;
    }

    data.forEach(
        message => {

            displayMessage(
                message
            );
        }
    );

    messagesBox.scrollTop =
        messagesBox.scrollHeight;
}
// ==========================================
// DISPLAY MESSAGE
// ==========================================

function displayMessage(message) {

    if (message && message.id) {
        if (renderedMessageIds.has(message.id)) return;
        renderedMessageIds.add(message.id);
    }

    const messagesBox =
        document.getElementById("messages");

    const messageRow =
        document.createElement("div");

    const isMine =
        message.sender_id === currentUser.id;

    messageRow.className =
        isMine
            ? "message-row mine"
            : "message-row";

    const bubble =
        document.createElement("div");

    bubble.className =
        isMine
            ? "message-bubble mine"
            : "message-bubble";

    bubble.innerHTML = `
        <div class="message-text">
            ${escapeHTML(
                message.message || ""
            )}
        </div>

        <div class="message-time">
            ${formatTime(
                message.created_at
            )}
        </div>
    `;

    messageRow.appendChild(bubble);

    messagesBox.appendChild(messageRow);
}


// ==========================================
// SEND MESSAGE
// ==========================================

async function sendMessage() {

    if (
        !currentUser ||
        (!currentConversation && !currentGroup)
    ) {
        return;
    }

    const input =
        document.getElementById("messageInput");

    const text =
        input.value.trim();

    if (!text) return;

    input.disabled = true;

    document.getElementById(
        "sendButton"
    ).disabled = true;

    let messageData = {

        sender_id:
            currentUser.id,

        message:
            text
    };

    if (currentConversation) {

        messageData.conversation_id =
            currentConversation.id;
    }

    if (currentGroup) {

        messageData.group_id =
            currentGroup.id;
    }

    const {
        data,
        error
    } = await supabaseClient
        .from("messages")
        .insert(messageData)
        .select()
        .single();

    if (error) {

        console.error(
            "SEND MESSAGE ERROR:",
            error
        );

        alert(
            "Could not send message: " +
            error.message
        );

        input.disabled = false;

        document.getElementById(
            "sendButton"
        ).disabled = false;

        return;
    }

    input.value = "";

    displayMessage(data);

    showNotification(
        "Message sent",
        "Your message was sent successfully.",
        "sent"
    );

    const messagesBox =
        document.getElementById("messages");

    messagesBox.scrollTop =
        messagesBox.scrollHeight;

    input.disabled = false;

    document.getElementById(
        "sendButton"
    ).disabled = false;

    input.focus();
}


// ==========================================
// ENTER KEY
// ==========================================

function handleEnter(event) {

    if (event.key === "Enter") {

        event.preventDefault();

        sendMessage();
    }
}


// ==========================================
// SEARCH
// ==========================================

function searchChats() {

    const search =
        document.getElementById(
            "searchChats"
        ).value.toLowerCase();

    const items =
        document.querySelectorAll(
            ".conversation-item"
        );

    items.forEach(item => {

        const text =
            item.textContent.toLowerCase();

        if (text.includes(search)) {

            item.style.display = "flex";

        } else {

            item.style.display = "none";
        }
    });
}


// ==========================================
// TIME
// ==========================================

function formatTime(timestamp) {

    if (!timestamp) return "";

    const date =
        new Date(timestamp);

    return date.toLocaleTimeString(
        [],
        {
            hour: "2-digit",
            minute: "2-digit"
        }
    );
}


// ==========================================
// SECURITY
// ==========================================

function escapeHTML(text) {

    if (
        text === null ||
        text === undefined
    ) {
        return "";
    }

    const div =
        document.createElement("div");

    div.textContent =
        String(text);

    return div.innerHTML;
}
// ==========================================
// CHECK EXISTING SESSION
// ==========================================

async function checkUser() {

    const {
        data,
        error
    } =
        await supabaseClient.auth.getSession();

    if (error) {

        console.error(
            "SESSION ERROR:",
            error
        );

        return;
    }

    if (
        data &&
        data.session
    ) {

        currentUser =
            data.session.user;

        await showChatScreen();
    }
}


// ==========================================
// START CHAT HUB
// ==========================================

window.addEventListener(
    "load",
    function () {

        checkUser();
    }
);